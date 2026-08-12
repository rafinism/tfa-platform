const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Create Default TCL Clubs with 1,000 TCP Starting Balances
  const phoenix = await prisma.club.upsert({
    where: { clubName: 'Phoenix FC' },
    update: {},
    create: {
      clubName: 'Phoenix FC',
      logoUrl: '/logos/phoenix.png',
      balance: 1000,
    },
  });

  const vanguard = await prisma.club.upsert({
    where: { clubName: 'Vanguard United' },
    update: {},
    create: {
      clubName: 'Vanguard United',
      logoUrl: '/logos/vanguard.png',
      balance: 1000,
    },
  });

  const titans = await prisma.club.upsert({
    where: { clubName: 'Titans City' },
    update: {},
    create: {
      clubName: 'Titans City',
      logoUrl: '/logos/titans.png',
      balance: 1000,
    },
  });

  console.log('✅ Default clubs seeded with 1,000 TCP balance.');

  // 2. Seed Sample Initial Player Pool with Categories & MSV Values
  const initialPlayers = [
    { canonicalName: 'E. Haaland', position: 'CF', ratingCategory: 'A', msvValue: 30 },
    { canonicalName: 'K. Mbappé', position: 'LFW', ratingCategory: 'A', msvValue: 30 },
    { canonicalName: 'K. De Bruyne', position: 'AMF', ratingCategory: 'B', msvValue: 25 },
    { canonicalName: 'J. Bellingham', position: 'CMF', ratingCategory: 'B', msvValue: 25 },
    { canonicalName: 'V. van Dijk', position: 'CB', ratingCategory: 'C', msvValue: 20 },
    { canonicalName: 'R. Hernández', position: 'LB', ratingCategory: 'C', msvValue: 20 },
    { canonicalName: 'A. Becker', position: 'GK', ratingCategory: 'D', msvValue: 15 },
    { canonicalName: 'G. Donnarumma', position: 'GK', ratingCategory: 'D', msvValue: 15 },
    { canonicalName: 'Pedri', position: 'CMF', ratingCategory: 'E', msvValue: 10 },
    { canonicalName: 'Gavi', position: 'CMF', ratingCategory: 'E', msvValue: 10 },
  ];

  for (const p of initialPlayers) {
    const existing = await prisma.player.findFirst({ where: { canonicalName: p.canonicalName } });
    if (!existing) {
      await prisma.player.create({ data: p });
    }
  }

  console.log('✅ Player pool seeded with Categories A–E and constitutional MSV limits.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
