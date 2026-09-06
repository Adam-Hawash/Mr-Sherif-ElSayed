const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fix() {
  // 1. ExamResult: add answers column
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE ExamResult ADD COLUMN answers TEXT DEFAULT ""');
    console.log('ExamResult: answers column added');
  } catch(e) {
    console.log('ExamResult answers:', e.message.includes('duplicate') ? 'already exists' : e.message);
  }

  // 2. HomeworkResult: create table if missing
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS HomeworkResult (
        id TEXT PRIMARY KEY,
        homeworkId TEXT NOT NULL,
        studentId TEXT NOT NULL,
        score REAL NOT NULL DEFAULT 0,
        maxScore REAL NOT NULL DEFAULT 100,
        answers TEXT DEFAULT '',
        submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('HomeworkResult: table created/exists');
  } catch(e) {
    console.error('HomeworkResult create error:', e.message);
  }

  // 3. HomeworkResult: add answers column (if table existed without it)
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE HomeworkResult ADD COLUMN answers TEXT DEFAULT ""');
    console.log('HomeworkResult: answers column added');
  } catch(e) {
    console.log('HomeworkResult answers:', e.message.includes('duplicate') ? 'already exists' : e.message);
  }

  // 4. Verify
  try {
    const ec = await prisma.$queryRawUnsafe('SELECT name FROM pragma_table_info("ExamResult")');
    console.log('ExamResult cols:', ec.map(c => c.name).join(', '));
  } catch(e) {}
  try {
    const hc = await prisma.$queryRawUnsafe('SELECT name FROM pragma_table_info("HomeworkResult")');
    console.log('HomeworkResult cols:', hc.map(c => c.name).join(', '));
  } catch(e) {}

  await prisma.$disconnect();
}

fix().catch(console.error);
