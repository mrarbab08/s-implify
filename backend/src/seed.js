'use strict';
/**
 * Seeds the SQLite database with a complete S-Implify dataset,
 * mirroring the reference "Sheldon ISD" demo data the frontend was built around.
 */
const { getAll, getOne, insert, run, getMeta, setMeta, nowIso } = require('./db');
const { hashPassword, seededRandom, round, asBoolOrNull } = require('./util');

function seedIfEmpty() {
  if (getMeta('seeded') === '1') return false;

  run(`
    INSERT INTO users (email, passwordHash, passwordSalt, firstName, lastName, displayName, isActive, createdAt)
    SELECT 'seed-placeholder', 'x', 'x', 'x', 'x', 'x', 1, ''
    WHERE 1 = 0
  `);

  const now = nowIso();
  const audit = { createdAt: now, createdBy: 'seed' };

  // ------------------------------------------------------------- reference data
  const stateId = insert('INSERT INTO states (stateCode, stateName, isActive, createdAt, createdBy) VALUES (?,?,?,?,?)',
    ['TX', 'Texas', 1, audit.createdAt, audit.createdBy]);

  const districtId = insert(`INSERT INTO districts
    (stateId, districtName, districtCode, districtAbbreviation, districtPhone, districtTimeZone, isActive, createdAt, createdBy)
    VALUES (?,?,?,?,?,?,?,?,?)`,
    [stateId, 'Sheldon ISD', 'SH-ISD', 'SISD', '281-888-8888', 'America/Chicago', 1, audit.createdAt, audit.createdBy]);

  const yearOld = insert('INSERT INTO academic_years (yearLabel, startDate, endDate, isActive, createdAt, createdBy) VALUES (?,?,?,?,?,?)',
    ['2024-2025', '2024-08-12', '2025-06-04', 0, audit.createdAt, audit.createdBy]);
  const yearNew = insert('INSERT INTO academic_years (yearLabel, startDate, endDate, isActive, createdAt, createdBy) VALUES (?,?,?,?,?,?)',
    ['2025-2026', '2025-08-12', '2026-06-04', 1, audit.createdAt, audit.createdBy]);

  const quarterDefs = [
    ['BOY', 'Beginning of Year', 1, '2025-08-12', '2025-09-26'],
    ['PA1', 'Progress Assessment 1', 2, '2025-09-29', '2025-11-07'],
    ['PA2', 'Progress Assessment 2', 3, '2025-11-10', '2025-12-19'],
    ['MOY', 'Middle of Year', 4, '2026-01-06', '2026-02-20'],
    ['PA3', 'Progress Assessment 3', 5, '2026-02-23', '2026-04-03'],
    ['PA4', 'Progress Assessment 4', 6, '2026-04-06', '2026-05-15'],
    ['PA5', 'Progress Assessment 5', 7, '2026-05-18', '2026-05-29'],
    ['EOY', 'End of Year', 8, '2026-05-26', '2026-06-04'],
  ];
  const quarterIds = {};
  for (const [code, name, order, sd, ed] of quarterDefs) {
    quarterIds[code] = insert(
      `INSERT INTO district_quarters (districtId, academicYearId, quarterCode, quarterName, startDate, endDate, sortOrder, isActive, createdAt, createdBy)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [districtId, yearNew, code, name, sd, ed, order, code === 'BOY' ? 1 : 0, audit.createdAt, audit.createdBy]);
    const sdPrev = sd.replace('2025', '2024').replace('2026', '2025');
    const edPrev = ed.replace('2025', '2024').replace('2026', '2025');
    insert(
      `INSERT INTO district_quarters (districtId, academicYearId, quarterCode, quarterName, startDate, endDate, sortOrder, isActive, createdAt, createdBy)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [districtId, yearOld, code, name, sdPrev, edPrev, order, 1, audit.createdAt, audit.createdBy]);
  }

  // grades
  const gradeDefs = [
    ['03', '3rd Grade', 1], ['04', '4th Grade', 2], ['05', '5th Grade', 3],
    ['06', '6th Grade', 4], ['07', '7th Grade', 5], ['08', '8th Grade', 6],
    ['09', '9th Grade', 7], ['10', '10th Grade', 8], ['11', '11th Grade', 9], ['12', '12th Grade', 10],
  ];
  const gradeIds = {};
  for (const [code, name, order] of gradeDefs) {
    gradeIds[code] = insert('INSERT INTO grades (gradeCode, gradeName, sortOrder, isActive, createdAt, createdBy) VALUES (?,?,?,?,?,?)',
      [code, name, order, 1, audit.createdAt, audit.createdBy]);
  }

  // campus categories
  const catIds = {};
  const catDefs = [['ES', 'ELEMENTARY SCHOOL'], ['MS', 'MIDDLE SCHOOL'], ['HS', 'HIGH SCHOOL']];
  for (const [code, name] of catDefs) {
    catIds[code] = insert('INSERT INTO campus_categories (categoryCode, categoryName, isActive, createdAt, createdBy) VALUES (?,?,?,?,?)',
      [code, name, 1, audit.createdAt, audit.createdBy]);
  }

  // campuses (matches the reference mock: HMC, MON, RWE, KAS, ECHS, NMS, KMS)
  const campusDefs = [
    ['HMC', 'H.M. Carroll Elementary', 'ES', '001'],
    ['MON', 'Monahan Elementary', 'ES', '002'],
    ['RWE', 'Royalwood Elementary', 'ES', '003'],
    ['KAS', 'KASE', 'ES', '004'],
    ['ECHS', 'Early College High School', 'HS', '005'],
    ['NMS', 'Null Middle School', 'MS', '006'],
    ['KMS', 'King Middle School', 'MS', '007'],
  ];
  const campusIds = {}; // code -> id
  for (const [code, name, cat, cc] of campusDefs) {
    campusIds[code] = insert(
      'INSERT INTO campuses (districtId, campusCategoryId, campusCode, campusName, campusIdExternal, isActive, createdAt, createdBy) VALUES (?,?,?,?,?,?,?,?)',
      [districtId, catIds[cat], code, name, `ext-${cc}`, 1, audit.createdAt, audit.createdBy]);
  }

  // subjects
  const subjectIds = {};
  const subjectDefs = [['MATH', 'Mathematics'], ['RLA', 'Reading Language Arts'], ['SCI', 'Science'], ['SS', 'Social Studies']];
  for (const [code, name] of subjectDefs) {
    subjectIds[code] = insert('INSERT INTO subjects (subjectCode, subjectName, isActive, createdAt, createdBy) VALUES (?,?,?,?,?)',
      [code, name, 1, audit.createdAt, audit.createdBy]);
  }
  for (const code of ['MATH', 'RLA', 'SCI']) {
    insert('INSERT INTO district_subjects (districtId, subjectId, isActive, createdAt, createdBy) VALUES (?,?,?,?,?)',
      [districtId, subjectIds[code], 1, audit.createdAt, audit.createdBy]);
  }

  // campus grades
  const campusGradeRanges = {
    HMC: ['03', '04', '05'], MON: ['03', '04', '05'], RWE: ['03', '04', '05'], KAS: ['03', '04', '05'],
    NMS: ['06', '07', '08'], KMS: ['06', '07', '08'], ECHS: ['09', '10', '11', '12'],
  };
  for (const [code, grades] of Object.entries(campusGradeRanges)) {
    for (const g of grades) {
      insert('INSERT INTO campus_grades (districtId, campusId, gradeId, isActive, createdAt, createdBy) VALUES (?,?,?,?,?,?)',
        [districtId, campusIds[code], gradeIds[g], 1, audit.createdAt, audit.createdBy]);
    }
  }

  // district academies (10, matching CCMR mock scale)
  const academyDefs = [
    ['ECH', 'Early College Academy'], ['FBL', 'Future Business Leaders'],
    ['STA', 'STEM & Technology Academy'], ['HCA', 'Health Careers Academy'],
    ['PER', 'Performing Arts Academy'], ['AGP', 'Agricultural Sciences'],
    ['PUB', 'Public Service Academy'], ['IND', 'Industrial Technology'],
    ['EDU', 'Educators Academy'], ['MIL', 'Leadership & Military'],
  ];
  academyDefs.forEach(([, name], i) => {
    insert('INSERT INTO district_academies (districtId, academyCode, academyName, sortOrder, isActive, createdAt, createdBy) VALUES (?,?,?,?,?,?,?)',
      [districtId, academyDefs[i][0], name, i + 1, 1, audit.createdAt, audit.createdBy]);
  });

  // ------------------------------------------------------------- teachers
  const campusSubjects = {
    HMC: ['MATH', 'RLA', 'SCI'], MON: ['MATH', 'RLA', 'SCI'], RWE: ['MATH', 'RLA', 'SCI'], KAS: ['MATH', 'RLA', 'SCI'],
    NMS: ['MATH', 'RLA', 'SCI', 'SS'], KMS: ['MATH', 'RLA', 'SCI', 'SS'], ECHS: ['MATH', 'RLA', 'SCI', 'SS'],
  };
  const campusGradesOf = campusGradeRanges;
  const teacherNames = [
    ['Sonia', 'Salinas'], ['Gloria', 'Leal'], ['Maria', 'Luna'], ['Sheila', 'Buchanan'], ['Aaron', 'Moon'],
    ['Elyse', 'Mcginnis'], ['Robert', 'Fisher'], ['Nancy', 'Wilson'], ['James', 'Ortega'], ['Linda', 'Ramirez'],
    ['Betty', 'Anderson'], ['Karen', 'Martinez'], ['Paul', 'Walker'], ['Sandra', 'Lopez'], ['Mark', 'Turner'],
    ['Donna', 'Phillips'], ['Steven', 'Campbell'], ['Michelle', 'Parker'], ['Kevin', 'Evans'], ['Rachel', 'Edwards'],
    ['Timothy', 'Collins'], ['Laura', 'Stewart'], ['Jason', 'Morris'], ['Cynthia', 'Rogers'],
  ];
  const teacherSubjectsByCampus = {}; // campusCode -> []
  let teacherSeq = 0;
  for (const [campusCode, subjSet] of Object.entries(campusSubjects)) {
    const gradesForCampus = campusGradesOf[campusCode];
    teacherSubjectsByCampus[campusCode] = [];
    for (const subj of subjSet) {
      // one teacher per subject per campus, cycling grade levels
      gradesForCampus.forEach((g, gradeIdx) => {
        if (teacherSeq >= teacherNames.length) return;
        const [fn, ln] = teacherNames[teacherSeq++];
        const gradeCode = gradesForCampus[gradeIdx % gradesForCampus.length];
        const gradeId = gradeIds[gradeCode];
        const subjectId = subjectIds[subj];
        const tid = insert(
          'INSERT INTO teachers (teacherIdExternal, districtId, campusId, gradeId, subjectId, firstName, lastName, isActive, createdAt, createdBy) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [null, districtId, campusIds[campusCode], gradeId, subjectId, fn, ln, 1, audit.createdAt, audit.createdBy]);
        run('UPDATE teachers SET teacherIdExternal = ? WHERE teacherId = ?', [`ext-${campusCode}-${tid}`, tid]);
        teacherSubjectsByCampus[campusCode].push({
          teacherId: tid, externalKey: `ext-${campusCode}-${tid}`, firstName: fn, lastName: ln, gradeCode, gradeId, subjectId, subjectCode: subj,
        });
      });
    }
  }
  // ensure at least one teacher per campus/subject by topping up with generic teachers if pool exhausted
  for (const [campusCode, list] of Object.entries(teacherSubjectsByCampus)) {
    for (const subj of ['MATH', 'RLA', 'SCI']) {
      if (!list.some((t) => t.subjectCode === subj)) {
        const fn = 'Alex', ln = `A-${campusCode}-${subj}`;
        const gradeCode = campusGradesOf[campusCode][0];
        const tid = insert(
          'INSERT INTO teachers (teacherIdExternal, districtId, campusId, gradeId, subjectId, firstName, lastName, isActive, createdAt, createdBy) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [null, districtId, campusIds[campusCode], gradeIds[gradeCode], subjectIds[subj], fn, ln, 1, audit.createdAt, audit.createdBy]);
        run('UPDATE teachers SET teacherIdExternal = ? WHERE teacherId = ?', [`ext-${campusCode}-${tid}`, tid]);
        list.push({ teacherId: tid, externalKey: `ext-${campusCode}-${tid}`, firstName: fn, lastName: ln, gradeCode, gradeId: gradeIds[gradeCode], subjectId: subjectIds[subj], subjectCode: subj });
      }
    }
  }

  // ------------------------------------------------------------- students
  const firstNames = ['Alexander', 'Maria', 'Diego', 'Isabella', 'Mateo', 'Sofia', 'Liam', 'Emma', 'Noah', 'Ava',
    'Ethan', 'Olivia', 'Lucas', 'Mia', 'Aiden', 'Charlotte', 'Mason', 'Amelia', 'Jacob', 'Harper',
    'Sebastian', 'Evelyn', 'Carlos', 'Abigail', 'Jayden', 'Emily', 'Daniel', 'Ella', 'Jose', 'Scarlett'];
  const lastNames = ['Garcia', 'Martinez', 'Hernandez', 'Lopez', 'Almodovar', 'Banda', 'Aguilar', 'Salinas', 'Davis', 'Wilson',
    'Anderson', 'Thomas', 'Moore', 'Taylor', 'Brown', 'Jones', 'Miller', 'Jackson', 'White', 'Harris'];
  const ethnicities = ['H', 'H', 'H', 'B', 'W', 'W', 'A'];
  const testLangs = ['English', 'English', 'English', 'English', 'Spanish'];

  const studentSeedRng = (i) => seededRandom(`student-${i}`);
  const students = []; // {localId, first, last, campusCode, gradeCode, specialEd, ed, eb, ethnicity, language}
  let localSeq = 10001;
  // teacher lookup maps: preference for exact (grade, subject) match, then any teacher of that subject
  const teacherByCampusSubject = {};
  for (const [campusCode, list] of Object.entries(teacherSubjectsByCampus)) {
    teacherByCampusSubject[campusCode] = {};
    for (const t of list) {
      const key = `${t.gradeCode}|${t.subjectCode}`;
      if (!teacherByCampusSubject[campusCode][key]) teacherByCampusSubject[campusCode][key] = t;
      if (!teacherByCampusSubject[campusCode][t.subjectCode]) teacherByCampusSubject[campusCode][t.subjectCode] = t;
    }
  }

  const studentCountPerCampusGrade = 4;
  let sIdx = 0;
  for (const [campusCode] of campusDefs) {
    for (const gradeCode of campusGradeRanges[campusCode]) {
      for (let n = 0; n < studentCountPerCampusGrade; n++) {
        const r = studentSeedRng(sIdx);
        const first = firstNames[Math.floor(r * 977) % firstNames.length];
        const last = lastNames[Math.floor(r * 613) % lastNames.length];
        const localId = String(localSeq++);
        const student = {
          localId, first, last, campusCode, gradeCode,
          specialEducation: studentSeedRng(`se-${i2(sIdx)}`) < 0.12,
          economicDisadvantage: studentSeedRng(`ed-${i2(sIdx)}`) < 0.55,
          emergentBilingual: studentSeedRng(`eb-${i2(sIdx)}`) < 0.25,
          ethnicity: ethnicities[Math.floor(seededRandom(`eth-${i2(sIdx)}`) * ethnicities.length)],
          language: testLangs[Math.floor(seededRandom(`lang-${i2(sIdx)}`) * testLangs.length)],
        };
        students.push(student);
        sIdx++;
      }
    }
  }

  // ------------------------------------------------------------- student growth records
  const quartersSeq = ['BOY', 'PA1', 'MOY', 'EOY'];
  const rowRng = (key) => seededRandom(key);
  for (const st of students) {
    const subjectsForStudent = st.gradeCode <= '05' ? ['MATH', 'RLA', 'SCI'] : ['MATH', 'RLA', 'SCI', 'SS'];
    for (const subjectCode of subjectsForStudent) {
      const teacher = (teacherByCampusSubject[st.campusCode] || {})[`${st.gradeCode}|${subjectCode}`]
        || (teacherByCampusSubject[st.campusCode] || {})[subjectCode];
      const teacherName = teacher ? `${teacher.lastName}, ${teacher.firstName}` : 'Unassigned';
      for (const quarterCode of quartersSeq) {
        const qi = quartersSeq.indexOf(quarterCode);
        const base = 30 + rowRng(`q-${st.localId}-${subjectCode}`) * 40 + qi * 6;
        const staarScore = Math.round(1200 + rowRng(`s-${st.localId}-${subjectCode}`) * 1100 + qi * 55);
        const quarterScore = Math.max(0, Math.min(100, round(base + rowRng(`qs-${st.localId}-${subjectCode}-${quarterCode}`) * 12, 0)));
        const app = round(Math.max(10, Math.min(100, 45 + rowRng(`a-${st.localId}`) * 40 + qi * 4)), 1);
        const meets = round(Math.max(5, Math.min(70, app * 0.55 + rowRng(`m-${st.localId}`) * 14)), 1);
        const masters = round(Math.max(1, Math.min(45, app * 0.16 + rowRng(`ma-${st.localId}`) * 12)), 1);
        insert(`
          INSERT INTO student_growth_records (
            districtId, academicYearId, quarterCode, localId, studentName, campusCode, gradeCode, subjectCode,
            teacherIdExternal, teacherName, testLang, specialEducation, economicDisadvantage, emergentBilingual, ethnicity,
            staar, staarPerLevel, quarterScore, quarterPerLevel, cs, delta, growth, app, meets, masters,
            totalGrowthForQuarter, hb1416, hb1416Delta, createdAt
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `, [
          districtId, yearNew, quarterCode, st.localId, `${st.last}, ${st.first}`, st.campusCode, st.gradeCode, subjectCode,
          teacher ? teacher.externalKey : null, teacherName, st.language,
          st.specialEducation ? 1 : 0, st.economicDisadvantage ? 1 : 0, st.emergentBilingual ? 1 : 0, st.ethnicity,
          staarScore, round(staarScore / 2400 * 100, 0), quarterScore, round(quarterScore, 0),
          round((app * 0.5 + quarterScore * 0.5), 1), round(rowRng(`d-${st.localId}-${quarterCode}`) * 6 - 2, 1),
          round(quarterScore, 0), app, meets, masters,
          round(rowRng(`tg-${st.localId}-${quarterCode}`) * 14, 1),
          rowRng(`hb-${st.localId}-${quarterCode}`) < 0.2 ? 1 : 0, rowRng(`hbd-${st.localId}-${quarterCode}`) < 0.25 ? 1 : 0,
          now,
        ]);
      }
    }
  }

  // ------------------------------------------------------------- campus attendance daily (Aug 2025 - Apr 2026, weekdays)
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const enrolledByCampus = { HMC: 540, MON: 680, RWE: 620, KAS: 260, ECHS: 380, NMS: 920, KMS: 870 };
  let dateCursor = new Date('2025-08-12T00:00:00Z');
  const endDate = new Date('2026-04-30T00:00:00Z');
  while (dateCursor < endDate) {
    const day = dateCursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      const isoDate = dateCursor.toISOString().slice(0, 10);
      const monthName = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][dateCursor.getUTCMonth()];
      for (const [campusCode] of campusDefs) {
        const enrollment = enrolledByCampus[campusCode];
        const ada = round(84 + rowRng(`ada-${campusCode}-${isoDate}`) * 12, 2);
        const studentsAbsent = Math.round(enrollment * (1 - ada / 100));
        const estimatedMissed = round(studentsAbsent * 45.5, 0);
        insert(`
          INSERT INTO campus_attendance_daily (
            districtId, academicYearId, campusCode, campusName, attendanceDate, dayOfWeek,
            campusAdaPct, campusAda, enrollment, studentsAbsent, absentCount, estimatedMissed, estimatedMissedFinance, absGoal, createdAt
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `, [districtId, yearNew, campusCode, campusDefs.find(([c]) => c === campusCode)[1], isoDate, dayNames[day],
          ada, round(ada / 100 * enrollment, 0), enrollment, studentsAbsent, studentsAbsent, estimatedMissed, estimatedMissed, 95, now]);
      }
    }
    dateCursor = new Date(dateCursor.getTime() + 24 * 3600 * 1000);
  }

  // ------------------------------------------------------------- individual attendance (quarterly)
  const quarterSubset = ['BOY', 'PA1', 'MOY', 'EOY'];
  for (const st of students) {
    for (const quarterCode of quarterSubset) {
      const membership = 40 + Math.round(rowRng(`mem-${st.localId}-${quarterCode}`) * 20);
      const absent = Math.round(rowRng(`ab-${st.localId}-${quarterCode}`) * 8);
      const pia = round(Math.max(0, Math.min(100, (membership - absent) / membership * 100)), 1);
      insert(`
        INSERT INTO individual_attendance_records (
          districtId, academicYearId, quarterCode, campusCode, localId, firstName, lastName,
          totalDaysMembership, totalDaysAbsent, totalPia, createdAt
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `, [districtId, yearNew, quarterCode, st.campusCode, st.localId, st.first, st.last, membership, absent, pia, now]);
    }
  }

  // ------------------------------------------------------------- CCMR
  const yearMonths = ['August', 'September', 'October', 'November', 'December', 'January', 'February', 'March', 'April'];
  for (const [i, m] of yearMonths.entries()) {
    insert('INSERT INTO ccmr_monthly_rates (districtId, academicYearId, calendarMonth, gradeRate, ccmrRate, createdAt) VALUES (?,?,?,?,?,?)',
      [districtId, yearNew, m, round(70 + rowRng(`gr-${m}`) * 25, 1), round(22 + rowRng(`cr-${m}`) * 12 + i * 0.6, 1), now]);
  }
  for (const [academyCode] of academyDefs) {
    for (const m of yearMonths) {
      const total = Math.round(174 + rowRng(`tot-${academyCode}`) * 240);
      const ccmrRate = round(20 + rowRng(`c-${academyCode}-${m}`) * 18, 1);
      insert(`
        INSERT INTO ccmr_academy_month_stats (
          districtId, academicYearId, school, calendarMonth, totalStudent, ccmr, gradRate, onTrack, likely, notLikely, createdAt
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `, [districtId, yearNew, academyCode, m, total, ccmrRate,
        round(65 + rowRng(`g-${academyCode}-${m}`) * 30, 1),
        round(ccmrRate + rowRng(`ot-${academyCode}-${m}`) * 15, 1),
        round(ccmrRate * 1.4 + rowRng(`l-${academyCode}-${m}`) * 8, 1),
        round(100 - ccmrRate - rowRng(`nl-${academyCode}-${m}`) * 6, 1), now]);
    }
  }
  // ccmr student records (~2 per academy per month sample)
  for (const [academyCode] of academyDefs) {
    for (const m of ['February', 'March', 'April']) {
      for (let i = 0; i < 8; i++) {
        const first = firstNames[Math.floor(rowRng(`cf-${academyCode}-${m}-${i}`) * 991) % firstNames.length];
        const last = lastNames[Math.floor(rowRng(`cl-${academyCode}-${m}-${i}`) * 991) % lastNames.length];
        const grade = String(9 + Math.floor(rowRng(`cg-${academyCode}-${m}-${i}`) * 4));
        const credit = Math.round(10 + rowRng(`cc-${academyCode}-${m}-${i}`) * 18);
        insert(`
          INSERT INTO ccmr_records (
            districtId, academicYearId, calendarMonth, academyCode, school, studentId, firstName, lastName,
            credit, campus, grade, planA, planB, ccmrMet, createdAt
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `, [districtId, yearNew, m, academyCode, academyCode, String(5000 + Math.floor(rowRng(`cid-${academyCode}-${m}-${i}`) * 9000)),
          first, last, credit, `${academyCode} Campus`, grade,
          ['CTE', 'Dual Credit', 'AP'][Math.floor(rowRng(`pa-${academyCode}-${m}-${i}`) * 3)],
          ['None', 'Military', 'Workforce'][Math.floor(rowRng(`pb-${academyCode}-${m}-${i}`) * 3)],
          credit >= 22, now]);
      }
    }
  }

  // ------------------------------------------------------------- teacher assessments
  const gradeOf = (g) => g;
  let evSeq = 1;
  for (const [campusCode, list] of Object.entries(teacherSubjectsByCampus)) {
    for (const t of list) {
      for (let rep = 0; rep < 2; rep++) {
        const rngKey = `ta-${t.teacherId}-${rep}`;
        const w1 = Math.round(55 + rowRng(`w1-${rngKey}`) * 45);
        const w2 = Math.round(50 + rowRng(`w2-${rngKey}`) * 50);
        const o1 = Math.round(58 + rowRng(`o1-${rngKey}`) * 42);
        const o2 = Math.round(55 + rowRng(`o2-${rngKey}`) * 45);
        const summ = round((w1 + w2 + o1 + o2) / 4, 1);
        insert(`
          INSERT INTO teacher_assessment_records (
            districtId, academicYearId, evaluationId, teacherIdExternal, teacherFirstName, teacherLastName,
            subjects, grade, evaluationDate, appraiserFirstName, appraiserLastName, appraiserTitle, campusCode,
            gradeCode, subjectCode, walkthrough1Score, walkthrough2Score, observation1Score, observation2Score,
            summativeScore, averageScore, growth, createdAt
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `, [districtId, yearNew, `EV-${String(evSeq++).padStart(4, '0')}`,
          `ext-${campusCode}-${t.teacherId}`, t.firstName, t.lastName,
          subjectNameOf(t.subjectCode), gradeOf(t.gradeCode), '2025-11-15',
          'Elyse', 'Mcginnis', 'Principal', campusCode, t.gradeCode, t.subjectCode,
          w1, w2, o1, o2, summ, round(summ * 0.65, 1), round(rowRng(`gr2-${rngKey}`) * 14, 1), now]);
      }
    }
  }

  // ------------------------------------------------------------- student standards (per quarter BOY/MOY)
  const standards = ['4.2.A', '4.2.B', '4.2.C', '4.2.D', '4.4.A', '4.4.B', '4.4.C', '4.4.D', '4.4.G', '4.5.A'];
  for (const quarterCode of ['BOY', 'PA1', 'MOY']) {
    for (const subjectCode of ['RLA', 'MATH']) {
      for (const st of students) {
        const teacher = (teacherByCampusSubject[st.campusCode] || {})[`${st.gradeCode}|${subjectCode}`]
          || (teacherByCampusSubject[st.campusCode] || {})[subjectCode];
        for (const std of standards) {
          const score = Math.round(rowRng(`std-${st.localId}-${std}-${quarterCode}`) * 100);
          insert(`
            INSERT INTO student_standards_scores (
              districtId, academicYearId, quarterCode, campusCode, gradeCode, subjectCode, teacherIdExternal, studentName, standardCode, score, createdAt
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
          `, [districtId, yearNew, quarterCode, st.campusCode, st.gradeCode, subjectCode,
            teacher ? teacher.externalKey : null, `${st.last}, ${st.first}`, std, score, now]);
        }
      }
    }
  }
  // precomputed averages per (quarter, campus, grade, subject, standard)
  const avgRows = getAll(`
    SELECT districtId, academicYearId, quarterCode, campusCode, gradeCode, subjectCode, standardCode, AVG(score) AS avgScore
    FROM student_standards_scores GROUP BY districtId, academicYearId, quarterCode, campusCode, gradeCode, subjectCode, standardCode
  `);
  for (const row of avgRows) {
    insert(`
      INSERT INTO student_standards_averages (districtId, academicYearId, quarterCode, campusCode, gradeCode, subjectCode, standardCode, average, createdAt)
      VALUES (?,?,?,?,?,?,?,?,?)
    `, [row.districtId, row.academicYearId, row.quarterCode, row.campusCode, row.gradeCode, row.subjectCode, row.standardCode, round(row.avgScore, 0), now]);
  }

  // ------------------------------------------------------------- student mobility snapshots
  const mobilityBase = { totalStudents: 12400, previous: 12280, incoming: 186, outgoing: 66 };
  for (const quarterCode of ['BOY', 'PA1', 'MOY', 'EOY']) {
    insert(`
      INSERT INTO student_mobility (
        districtId, academicYearId, quarterCode, campusCode, totalStudents, previousTotalStudents,
        incomingStudents, outgoingStudents, retainedStudents, netChange, previousQuarterCode, createdAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `, [districtId, yearNew, quarterCode, null,
      mobilityBase.totalStudents, mobilityBase.previous, mobilityBase.incoming, mobilityBase.outgoing,
      mobilityBase.totalStudents - mobilityBase.incoming - mobilityBase.outgoing, mobilityBase.incoming - mobilityBase.outgoing,
      quarterCode === 'BOY' ? null : quartersSeq[quartersSeq.indexOf(quarterCode) - 1], now]);
  }

  // ------------------------------------------------------------- dashboard metrics
  insert('INSERT INTO dashboard_metrics (districtId, academicYearId, ccmrRate, graduationRate, teachers, createdAt) VALUES (?,?,?,?,?,?)',
    [districtId, yearNew, 30.7, 98.6, 49.9, now]);

  // ------------------------------------------------------------- users + role assignments
  const createAssignment = (userId, roleId, roleName, opts = {}) => {
    insert(`
      INSERT INTO user_role_assignments (userId, roleId, roleName, stateId, districtId, campusId, teacherId, ttessAccess, roleDescription, isActive, createdAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `, [userId, roleId, roleName, opts.stateId ?? null, opts.districtId ?? null, opts.campusId ?? null,
      opts.teacherId ?? null, opts.ttessAccess ? 1 : (opts.ttessAccess === false ? 0 : null), opts.description ?? null, 1, now]);
  };
  const createUser = (email, password, first, last, displayName) => {
    const { hash, salt } = hashPassword(password);
    return insert(`
      INSERT INTO users (email, passwordHash, passwordSalt, firstName, lastName, displayName, isActive, createdAt, createdBy)
      VALUES (?,?,?,?,?,?,?,?,?)
    `, [email, hash, salt, first, last, displayName || email, 1, now, 'seed']);
  };

  const superAdminDesc = 'Full platform access across all districts and campuses.';
  const districtAdminDesc = 'Manage users, campuses, and reports for your district.';
  const principalDesc = 'View and manage data for your assigned campus.';
  const teacherDesc = 'View and manage data for your assigned classrooms.';

  const uidAdmin = createUser('admin@s-implify.local', 'Admin@123', 'Farhan', 'Zafar', 'Farhan Zafar');
  // Super admin holds all three platform roles so the role-selection page is shown after login.
  // SuperAdmin is NOT pinned to a district — full platform access (districtId null), otherwise
  // district switching, the districts drill-down and cross-district comparison are silently locked.
  createAssignment(uidAdmin, 1, 'SuperAdmin', { ttessAccess: true, description: superAdminDesc });
  createAssignment(uidAdmin, 2, 'DistrictAdmin', { stateId, districtId, ttessAccess: true, description: districtAdminDesc });
  createAssignment(uidAdmin, 3, 'Principal', { stateId, districtId, campusId: campusIds.HMC, ttessAccess: true, description: principalDesc });

  const uidDemo = createUser('demo@s-implify.local', 'Demo@123', 'Demo', 'User', 'Demo User');
  createAssignment(uidDemo, 1, 'SuperAdmin', { ttessAccess: true, description: superAdminDesc });
  createAssignment(uidDemo, 2, 'DistrictAdmin', { stateId, districtId, ttessAccess: true, description: districtAdminDesc });
  createAssignment(uidDemo, 3, 'Principal', { stateId, districtId, campusId: campusIds.HMC, ttessAccess: true, description: principalDesc });

  const uidPrincipal = createUser('principal@s-implify.local', 'Principal@123', 'Elizabeth', 'Torres', 'Elizabeth Torres');
  createAssignment(uidPrincipal, 3, 'Principal', { stateId, districtId, campusId: campusIds.RWE, ttessAccess: true, description: principalDesc });

  const uidTeacher = createUser('teacher@s-implify.local', 'Teacher@123', 'Sonia', 'Salinas', 'Sonia Salinas');
  const firstTeacher = getAll('SELECT teacherId, campusId FROM teachers LIMIT 1')[0];
  createAssignment(uidTeacher, 4, 'Teacher', { stateId, districtId, campusId: firstTeacher.campusId, teacherId: firstTeacher.teacherId, ttessAccess: false, description: teacherDesc });

  setMeta('seeded', '1');
  return true;
}

function subjectNameOf(code) {
  const map = { MATH: 'Mathematics', RLA: 'Reading Language Arts', SCI: 'Science', SS: 'Social Studies' };
  return map[code] || code;
}

function i2(n) {
  return String(n).padStart(5, '0');
}

module.exports = { seedIfEmpty };

