import { PrismaClient, RecordCategory } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const admin = await prisma.teacher.upsert({
    where: { email: "admin@school.example.jp" },
    update: {},
    create: {
      name: "管理者 太郎",
      email: "admin@school.example.jp",
      passwordHash,
      role: "ADMIN",
    },
  });

  const homeroomTeacher = await prisma.teacher.upsert({
    where: { email: "yamada@school.example.jp" },
    update: {},
    create: {
      name: "山田 花子",
      email: "yamada@school.example.jp",
      passwordHash,
      role: "STAFF",
    },
  });

  const advisorTeacher = await prisma.teacher.upsert({
    where: { email: "suzuki@school.example.jp" },
    update: {},
    create: {
      name: "鈴木 一郎",
      email: "suzuki@school.example.jp",
      passwordHash,
      role: "STAFF",
    },
  });

  const year = new Date().getFullYear();

  const classGroup = await prisma.classGroup.upsert({
    where: { year_grade_name: { year, grade: 2, name: "A組" } },
    update: {},
    create: {
      year,
      grade: 2,
      name: "A組",
      homeroomTeacherId: homeroomTeacher.id,
    },
  });

  const soccerClub = await prisma.club.upsert({
    where: { name: "サッカー部" },
    update: {},
    create: { name: "サッカー部", advisorId: advisorTeacher.id },
  });

  const brassBandClub = await prisma.club.upsert({
    where: { name: "吹奏楽部" },
    update: {},
    create: { name: "吹奏楽部", advisorId: advisorTeacher.id },
  });

  const studentsData = [
    {
      studentNumber: "2026-0201",
      name: "佐藤 陽菜",
      nameKana: "さとう ひな",
      attendanceNumber: 1,
    },
    {
      studentNumber: "2026-0202",
      name: "高橋 蓮",
      nameKana: "たかはし れん",
      attendanceNumber: 2,
    },
    {
      studentNumber: "2026-0203",
      name: "田中 結衣",
      nameKana: "たなか ゆい",
      attendanceNumber: 3,
    },
  ];

  const students = [];
  for (const data of studentsData) {
    const student = await prisma.student.upsert({
      where: { studentNumber: data.studentNumber },
      update: {},
      create: {
        ...data,
        admissionYear: year - 1,
        classId: classGroup.id,
      },
    });
    students.push(student);
  }

  await prisma.studentClub.upsert({
    where: {
      studentId_clubId: { studentId: students[0].id, clubId: soccerClub.id },
    },
    update: {},
    create: {
      studentId: students[0].id,
      clubId: soccerClub.id,
      position: "部長",
    },
  });

  await prisma.studentClub.upsert({
    where: {
      studentId_clubId: { studentId: students[1].id, clubId: soccerClub.id },
    },
    update: {},
    create: { studentId: students[1].id, clubId: soccerClub.id },
  });

  await prisma.studentClub.upsert({
    where: {
      studentId_clubId: {
        studentId: students[2].id,
        clubId: brassBandClub.id,
      },
    },
    update: {},
    create: { studentId: students[2].id, clubId: brassBandClub.id },
  });

  await prisma.dailyRecord.createMany({
    data: [
      {
        studentId: students[0].id,
        authorId: homeroomTeacher.id,
        category: RecordCategory.HEALTH,
        content: "体調不良のため早退。保護者へ連絡済み。",
      },
      {
        studentId: students[0].id,
        authorId: advisorTeacher.id,
        category: RecordCategory.CLUB,
        content: "部活動で県大会の目標設定について面談を実施。",
      },
      {
        studentId: students[1].id,
        authorId: homeroomTeacher.id,
        category: RecordCategory.CAREER,
        content: "進路希望調査票を提出。志望校について相談を受けた。",
      },
    ],
  });

  console.log("シードデータを投入しました。");
  console.log("ログイン用アカウント(パスワードは全員 password123):");
  console.log(`  管理者: ${admin.email}`);
  console.log(`  担任  : ${homeroomTeacher.email}`);
  console.log(`  顧問  : ${advisorTeacher.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
