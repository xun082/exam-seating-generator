import { NextRequest, NextResponse } from "next/server";

interface SeatAssignment {
  seatNumber: number;
  name: string;
  examId: string;
  roomNumber: number;
  row: number;
  col: number;
  className: string;
  grade: string;
}

// 获取相邻座位的班级信息
function getAdjacentClasses(
  grid: (SeatAssignment | null)[][],
  row: number,
  col: number
): Set<string> {
  const adjacentClasses = new Set<string>();
  const directions = [
    [-1, 0], // 上
    [1, 0], // 下
    [0, -1], // 左
    [0, 1], // 右
  ];

  const maxRows = grid.length;
  const maxCols = grid[0]?.length || 6;

  for (const [dr, dc] of directions) {
    const newRow = row + dr;
    const newCol = col + dc;
    if (
      newRow >= 0 &&
      newRow < maxRows &&
      newCol >= 0 &&
      newCol < maxCols &&
      grid[newRow][newCol]
    ) {
      const className = grid[newRow][newCol]?.className || "";
      if (className) {
        adjacentClasses.add(className);
      }
    }
  }

  return adjacentClasses;
}

// 智能分配座位，避免相邻座位相同班级
function assignSeatsSmartly(
  students: Array<{ name: string; className: string; grade: string }>,
  gradePrefixes: Record<string, string>,
  roomNumber: number,
  maxSeats: number = 36
): SeatAssignment[] {
  // 计算需要的网格大小（6列，行数根据人数计算）
  const cols = 6;
  const rows = Math.ceil(maxSeats / cols);

  // 创建动态大小的座位网格
  const grid: (SeatAssignment | null)[][] = Array(rows)
    .fill(null)
    .map(() => Array(cols).fill(null));

  // 创建学生池的副本，用于分配
  const studentPool = [...students];
  // 按班级分组，方便后续选择
  const studentsByClass = new Map<string, typeof students>();
  studentPool.forEach((student) => {
    const className = String(student.className || "");
    if (!studentsByClass.has(className)) {
      studentsByClass.set(className, []);
    }
    studentsByClass.get(className)!.push(student);
  });

  // 按行列顺序分配座位
  const maxRows = grid.length;
  const maxCols = grid[0]?.length || 6;

  for (let row = 0; row < maxRows; row++) {
    for (let col = 0; col < maxCols; col++) {
      const seatIndex = col * maxRows + row;
      const seatNumber = seatIndex + 1;

      // 获取相邻座位的班级
      const adjacentClasses = getAdjacentClasses(grid, row, col);

      // 尝试找到一个不与相邻座位相同班级的学生
      let selectedStudent: (typeof students)[0] | null = null;
      let selectedIndex = -1;

      // 第一轮：优先选择不与相邻座位相同班级的学生
      for (let i = 0; i < studentPool.length; i++) {
        const student = studentPool[i];
        const studentClass = String(student.className || "");
        if (!adjacentClasses.has(studentClass)) {
          selectedStudent = student;
          selectedIndex = i;
          break;
        }
      }

      // 如果找不到，选择班级人数最多的（这样后续更容易分配）
      if (!selectedStudent && studentPool.length > 0) {
        // 统计每个班级在剩余学生中的数量
        const classCounts = new Map<string, number>();
        studentPool.forEach((s) => {
          const className = String(s.className || "");
          classCounts.set(className, (classCounts.get(className) || 0) + 1);
        });

        // 选择不与相邻座位相同班级且剩余人数最多的班级
        let maxCount = -1;
        for (let i = 0; i < studentPool.length; i++) {
          const student = studentPool[i];
          const studentClass = String(student.className || "");
          const count = classCounts.get(studentClass) || 0;
          if (!adjacentClasses.has(studentClass) && count > maxCount) {
            maxCount = count;
            selectedStudent = student;
            selectedIndex = i;
          }
        }

        // 如果还是找不到，就随机选择一个
        if (!selectedStudent) {
          selectedIndex = Math.floor(Math.random() * studentPool.length);
          selectedStudent = studentPool[selectedIndex];
        }
      }

      if (selectedStudent && selectedIndex >= 0) {
        // 根据学生年级获取对应的前缀
        const studentGrade = String(selectedStudent.grade || "");
        const prefix = gradePrefixes[studentGrade] || "00011"; // 默认前缀
        const examId = `${prefix}${String(roomNumber).padStart(2, "0")}${String(
          seatNumber
        ).padStart(2, "0")}`;

        grid[row][col] = {
          seatNumber,
          name: String(selectedStudent.name || ""),
          examId,
          roomNumber,
          row: row + 1,
          col: col + 1,
          className: String(selectedStudent.className || ""),
          grade: String(selectedStudent.grade || ""),
        };

        // 从学生池中移除已分配的学生
        studentPool.splice(selectedIndex, 1);
      }
    }
  }

  // 将网格转换为座位数组（按列组织）
  const seats: SeatAssignment[] = [];
  for (let col = 0; col < maxCols; col++) {
    for (let row = 0; row < maxRows; row++) {
      if (grid[row][col]) {
        seats.push(grid[row][col]!);
      }
    }
  }

  return seats;
}

// 计算每个教室的学生分配
function calculateRoomDistribution(
  totalStudents: number,
  studentsPerRoom: number,
  strategy: "last" | "separate" | "average"
): number[] {
  const fullRooms = Math.floor(totalStudents / studentsPerRoom);
  const remainder = totalStudents % studentsPerRoom;

  if (remainder === 0) {
    // 正好整除，所有教室都是标准人数
    return Array(fullRooms).fill(studentsPerRoom);
  }

  const roomSizes: number[] = [];

  if (strategy === "last") {
    // 多余学生分配给最后一个教室
    for (let i = 0; i < fullRooms; i++) {
      roomSizes.push(studentsPerRoom);
    }
    if (fullRooms > 0) {
      roomSizes[roomSizes.length - 1] += remainder;
    } else {
      roomSizes.push(remainder);
    }
  } else if (strategy === "separate") {
    // 多余学生单独创建一个教室
    for (let i = 0; i < fullRooms; i++) {
      roomSizes.push(studentsPerRoom);
    }
    roomSizes.push(remainder);
  } else {
    // 平均分配到所有教室
    const baseSize = Math.floor(totalStudents / (fullRooms + 1));
    const extra = totalStudents % (fullRooms + 1);
    for (let i = 0; i <= fullRooms; i++) {
      roomSizes.push(baseSize + (i < extra ? 1 : 0));
    }
  }

  return roomSizes;
}

// 按用户要求的算法：每个考场包含所有班级，每班至少X人
function distributeStudentsWithMinPerClass(
  students: Array<{ name: string; className: string; grade: string }>,
  grade: string,
  studentsPerRoom: number,
  distributionStrategy: "last" | "separate" | "average"
): Array<Array<{ name: string; className: string; grade: string }>> {
  // 按班级分组学生
  const studentsByClass = new Map<string, typeof students>();
  students.forEach((student) => {
    const className = String(student.className || "");
    if (!studentsByClass.has(className)) {
      studentsByClass.set(className, []);
    }
    studentsByClass.get(className)!.push(student);
  });

  const numClasses = studentsByClass.size; // 该年级有多少个班
  const totalStudents = students.length;

  // 计算需要的考场数量
  const roomSizes = calculateRoomDistribution(
    totalStudents,
    studentsPerRoom,
    distributionStrategy
  );
  const numRooms = roomSizes.length;

  console.log(`\n=== 开始分配 ${grade} ===`);
  console.log(
    `总学生数: ${totalStudents}, 班级数: ${numClasses}, 考场数: ${numRooms}`
  );
  console.log(`每考场目标人数: [${roomSizes.join(", ")}]`);

  // 统计各班级人数
  console.log("\n各班级人数:");
  const classList = Array.from(studentsByClass.entries());
  classList.forEach(([className, classStudents]) => {
    console.log(`  ${className}班: ${classStudents.length}人`);
  });

  // 确定每个班级每个考场的最小人数
  let minPerClassPerRoom: number;
  if (grade === "八年级") {
    minPerClassPerRoom = 4;
  } else if (grade === "九年级") {
    minPerClassPerRoom = 5;
  } else {
    // 七年级：根据考场容量和班级数动态计算
    // 例如：36人/考场，8个班 → 至少 36÷8 = 4人/班
    minPerClassPerRoom = Math.floor(studentsPerRoom / numClasses);
  }

  console.log(
    `\n算法规则: 每个考场包含所有${numClasses}个班级，每班至少${minPerClassPerRoom}人`
  );

  // === 用户要求的算法 ===
  const classDistributionPlan = new Map<string, number[]>();

  // 初始化分配计划
  for (const [className] of studentsByClass.entries()) {
    classDistributionPlan.set(className, Array(numRooms).fill(0));
  }

  // 为每个考场分配学生
  for (let roomIndex = 0; roomIndex < numRooms; roomIndex++) {
    const roomCapacity = roomSizes[roomIndex];
    const baseSeats = numClasses * minPerClassPerRoom; // 基础座位数
    const extraSeats = roomCapacity - baseSeats; // 剩余座位数

    console.log(`\n考场${roomIndex + 1} (容量${roomCapacity}人):`);
    console.log(
      `  基础分配: ${numClasses}班 × ${minPerClassPerRoom}人 = ${baseSeats}人`
    );
    console.log(`  剩余座位: ${extraSeats}人`);

    // 步骤1: 为每个班级分配最小人数
    const classesArray = Array.from(studentsByClass.keys());
    for (const className of classesArray) {
      const plan = classDistributionPlan.get(className)!;
      plan[roomIndex] = minPerClassPerRoom;
    }

    // 步骤2: 分配剩余座位（按各班剩余人数比例）
    if (extraSeats > 0) {
      // 计算每个班级还有多少人没分配
      const classRemaining = new Map<string, number>();
      for (const [className, classStudents] of studentsByClass.entries()) {
        const allocated = classDistributionPlan
          .get(className)!
          .reduce((sum, count) => sum + count, 0);
        const remaining = classStudents.length - allocated;
        classRemaining.set(className, remaining);
      }

      // 按剩余人数排序，优先分配给剩余人数多的班级
      const sortedClasses = Array.from(classRemaining.entries())
        .filter(([, remaining]) => remaining > 0)
        .sort((a, b) => b[1] - a[1]);

      let extraAllocated = 0;
      for (let i = 0; i < extraSeats && sortedClasses.length > 0; i++) {
        const classIndex = i % sortedClasses.length;
        const [className, remaining] = sortedClasses[classIndex];

        if (remaining > 0) {
          const plan = classDistributionPlan.get(className)!;
          plan[roomIndex]++;
          extraAllocated++;

          // 更新剩余人数
          sortedClasses[classIndex][1]--;

          // 如果该班级没有剩余了，从列表中移除
          if (sortedClasses[classIndex][1] <= 0) {
            sortedClasses.splice(classIndex, 1);
          }
        }
      }

      console.log(`  剩余座位分配: ${extraAllocated}人`);
    }

    // 显示本考场的班级分布
    const classBreakdown: string[] = [];
    classesArray.forEach((className) => {
      const count = classDistributionPlan.get(className)![roomIndex];
      classBreakdown.push(`${className}:${count}人`);
    });
    console.log(`  最终分配: [${classBreakdown.join(", ")}]`);
  }

  // 验证分配结果
  console.log("\n=== 分配结果验证 ===");

  // 验证每个班级的总人数
  console.log("\n各班级分配情况:");
  for (const [className, students] of studentsByClass.entries()) {
    const plan = classDistributionPlan.get(className)!;
    const allocated = plan.reduce((sum, count) => sum + count, 0);
    const expected = students.length;

    const distribution = plan
      .map((count, idx) => (count > 0 ? `考场${idx + 1}:${count}人` : null))
      .filter(Boolean)
      .join(", ");

    console.log(
      `  ${className}班: 分配${allocated}/${expected}人 | ${distribution}`
    );

    if (allocated !== expected) {
      console.warn(`  ⚠️ ${className}班人数不匹配！`);
    }
  }

  // 验证每个考场的总人数
  console.log("\n各考场人数统计:");
  for (let roomIndex = 0; roomIndex < numRooms; roomIndex++) {
    let total = 0;
    const classBreakdown: string[] = [];

    for (const [className, plan] of classDistributionPlan.entries()) {
      const count = plan[roomIndex];
      if (count > 0) {
        total += count;
        classBreakdown.push(`${className}:${count}人`);
      }
    }

    const target = roomSizes[roomIndex];
    const diff = total - target;

    console.log(
      `  考场${roomIndex + 1}: ${total}/${target}人 (${
        diff > 0 ? "+" : ""
      }${diff}) | ${classBreakdown.join(", ")}`
    );
  }

  // 第五步：按计划分配学生
  console.log("\n第五步：按计划分配学生");
  const roomStudents: Array<Array<(typeof students)[0]>> = Array(numRooms)
    .fill(null)
    .map(() => []);

  for (const [, classStudents] of studentsByClass.entries()) {
    const className = classStudents[0]
      ? String(classStudents[0].className || "")
      : "";
    const plan = classDistributionPlan.get(className)!;
    const shuffled = [...classStudents].sort(() => Math.random() - 0.5);

    let studentIndex = 0;
    plan.forEach((count, roomIndex) => {
      if (count > 0) {
        const studentsForRoom = shuffled.slice(
          studentIndex,
          studentIndex + count
        );
        roomStudents[roomIndex].push(...studentsForRoom);
        studentIndex += count;
      }
    });
  }

  // 打乱每个考场内的学生顺序
  roomStudents.forEach((room) => {
    room.sort(() => Math.random() - 0.5);
  });

  // 输出最终结果
  console.log(`\n=== ${grade} 最终分配结果 ===`);
  roomStudents.forEach((students, index) => {
    const classCounts = new Map<string, number>();
    students.forEach((student) => {
      const className = String(student.className || "");
      classCounts.set(className, (classCounts.get(className) || 0) + 1);
    });
    const breakdown = Array.from(classCounts.entries())
      .map(([cls, count]) => `${cls}:${count}`)
      .join(", ");
    console.log(
      `考场${index + 1}: ${students.length}人 (目标:${
        roomSizes[index]
      }) [${breakdown}]`
    );
  });

  return roomStudents;
}

export async function POST(request: NextRequest) {
  try {
    const {
      students,
      gradePrefixes = {
        七年级: "07011",
        八年级: "08011",
        九年级: "09011",
      },
      studentsPerRoom = 36,
      distributionStrategy = "last",
    } = await request.json();

    if (!Array.isArray(students) || students.length === 0) {
      return NextResponse.json({ error: "学生数据无效" }, { status: 400 });
    }

    if (studentsPerRoom < 1 || studentsPerRoom > 72) {
      return NextResponse.json(
        { error: "每教室人数必须在1-72之间" },
        { status: 400 }
      );
    }

    // 按年级分组学生
    const studentsByGrade = new Map<string, typeof students>();
    students.forEach((student) => {
      const grade = String(student.grade || "未知年级");
      if (!studentsByGrade.has(grade)) {
        studentsByGrade.set(grade, []);
      }
      studentsByGrade.get(grade)!.push(student);
    });

    const allSeatingArrangements: Array<{
      roomNumber: number;
      students: SeatAssignment[];
      grade: string;
    }> = [];

    // 为每个年级单独生成座位表（试室号从01开始）
    for (const [grade, gradeStudents] of studentsByGrade.entries()) {
      // 使用新的分配函数，确保满足最小人数要求
      const roomStudentsList = distributeStudentsWithMinPerClass(
        gradeStudents,
        grade,
        studentsPerRoom,
        distributionStrategy
      );

      // 为该年级的每个试室分配座位（试室号从1开始）
      for (
        let roomIndex = 0;
        roomIndex < roomStudentsList.length;
        roomIndex++
      ) {
        const roomNumber = roomIndex + 1; // 每个年级的试室号从1开始
        const roomStudents = roomStudentsList[roomIndex];
        const roomSize = roomStudents.length;

        // 使用智能算法分配座位，避免相邻座位相同班级
        const seats = assignSeatsSmartly(
          roomStudents,
          gradePrefixes,
          roomNumber,
          roomSize
        );

        allSeatingArrangements.push({
          roomNumber,
          students: seats,
          grade,
        });
      }
    }

    // 按年级排序座位表（七年级 -> 八年级 -> 九年级）
    const gradeOrder = ["七年级", "八年级", "九年级"];
    allSeatingArrangements.sort((a, b) => {
      const aIndex = gradeOrder.indexOf(a.grade);
      const bIndex = gradeOrder.indexOf(b.grade);
      if (aIndex !== bIndex) {
        return aIndex - bIndex;
      }
      return a.roomNumber - b.roomNumber;
    });

    return NextResponse.json({
      success: true,
      seatingArrangements: allSeatingArrangements,
      totalStudents: students.length,
      totalRooms: allSeatingArrangements.length,
    });
  } catch (error) {
    console.error("生成座位表错误:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "生成座位表失败",
      },
      { status: 500 }
    );
  }
}
