const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const jwt = require('@fastify/jwt');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();

fastify.register(cors, { origin: true });
fastify.register(jwt, { secret: process.env.JWT_SECRET || 'supersecret_tfa_key' });

// Serve Visual Website (index.html)
fastify.get('/', async (request, reply) => {
  const htmlPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(htmlPath)) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    return reply.type('text/html').send(html);
  }
  return { status: 'ONLINE', platform: 'TFA Simulator Engine' };
});

// Healthcheck Route
fastify.get('/api/v1/health', async () => {
  return { status: 'UP', timestamp: new Date() };
});

// User Registration Route
fastify.post('/api/v1/auth/register', async (request, reply) => {
  const { username, email, password } = request.body || {};
  if (!username || !email || !password) {
    return reply.status(400).send({ error: 'Username, email, and password required' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username, email, passwordHash, role: 'USER' },
    select: { id: true, username: true, email: true, role: true }
  });

  return reply.status(201).send({ user });
});

// Start Server
const start = async () => {
  try {
    const port = process.env.PORT || 10000;
    await fastify.listen({ port: Number(port), host: '0.0.0.0' });
    console.log(`🚀 TFA Engine running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
