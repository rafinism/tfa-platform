import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { z } from 'zod';

const prisma = new PrismaClient();
const fastify = Fastify({ logger: true });

// Register Plugins
fastify.register(cors, { origin: true });
fastify.register(jwt, { secret: process.env.JWT_SECRET || 'supersecret_tfa_key' });

// Authenticate Middleware
fastify.decorate("authenticate", async function (request: any, reply: any) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.status(401).send({ error: "Unauthorized access" });
  }
});

// Zod Validation Schemas
const RegisterSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(6),
});

const TransferSchema = z.object({
  buyerClubId: z.string().uuid(),
  sellerClubId: z.string().uuid(),
  playerId: z.string().uuid(),
  amountTcp: z.number().positive(),
});

// --- ROUTES ---

// 1. Auth: User Registration
fastify.post('/api/v1/auth/register', async (request, reply) => {
  const body = RegisterSchema.parse(request.body);
  const passwordHash = await bcrypt.hash(body.password, 10);

  const user = await prisma.user.create({
    data: {
      username: body.username,
      email: body.email,
      passwordHash,
      role: 'USER',
    },
    select: { id: true, username: true, email: true, role: true },
  });

  return reply.status(201).send({ user });
});

// 2. Auth: Login
fastify.post('/api/v1/auth/login', async (request, reply) => {
  const { email, password } = request.body as any;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return reply.status(401).send({ error: 'Invalid email or password' });
  }

  const token = fastify.jwt.sign({
    userId: user.id,
    username: user.username,
    role: user.role,
  });

  return { token, user: { id: user.id, username: user.username, role: user.role } };
});

// 3. Financial Core: Atomic Transfer Execution with Row-Level Lock
fastify.post('/api/v1/tcl/transfers/execute', { onRequest: [(fastify as any).authenticate] }, async (request, reply) => {
  const { buyerClubId, sellerClubId, playerId, amountTcp } = TransferSchema.parse(request.body);

  // Execute in isolated database transaction
  const result = await prisma.$transaction(async (tx) => {
    // 1. Lock and fetch buyer balance using Raw SQL for SELECT FOR UPDATE
    const [buyer]: any = await tx.$queryRaw`
      SELECT balance FROM clubs WHERE club_id = ${buyerClubId}::uuid FOR UPDATE
    `;

    if (!buyer) throw new Error("Buyer club not found");
    if (buyer.balance < amountTcp) throw new Error("Insufficient TCP balance");

    // 2. Lock and fetch seller
    const [seller]: any = await tx.$queryRaw`
      SELECT balance FROM clubs WHERE club_id = ${sellerClubId}::uuid FOR UPDATE
    `;
    if (!seller) throw new Error("Seller club not found");

    // 3. Deduct Buyer Balance & Create Ledger Entry
    const updatedBuyer = await tx.club.update({
      where: { id: buyerClubId },
      data: { balance: { decrement: amountTcp } },
    });

    await tx.tcpLedger.create({
      data: {
        clubId: buyerClubId,
        amount: -amountTcp,
        resultingBalance: updatedBuyer.balance,
        transactionType: 'TRANSFER_BUY',
        reason: `Purchased Player ID: ${playerId} from Club ID: ${sellerClubId}`,
      },
    });

    // 4. Credit Seller Balance & Create Ledger Entry
    const updatedSeller = await tx.club.update({
      where: { id: sellerClubId },
      data: { balance: { increment: amountTcp } },
    });

    await tx.tcpLedger.create({
      data: {
        clubId: sellerClubId,
        amount: amountTcp,
        resultingBalance: updatedSeller.balance,
        transactionType: 'TRANSFER_SELL',
        reason: `Sold Player ID: ${playerId} to Club ID: ${buyerClubId}`,
      },
    });

    // 5. Transfer Player Rights
    await tx.player.update({
      where: { id: playerId },
      data: { currentClubId: buyerClubId },
    });

    return { buyerBalance: updatedBuyer.balance, sellerBalance: updatedSeller.balance };
  });

  return reply.send({ success: true, transaction: result });
});

// Healthcheck Route
fastify.get('/api/v1/health', async () => ({ status: 'UP', timestamp: new Date() }));

// Start Server
const start = async () => {
  try {
    const port = Number(process.env.PORT) || 8080;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 TFA Engine running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
