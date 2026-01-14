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

// 按班级和最小人数要求分配学生到考场
function distributeStudentsWithMinPerClass(
  students: Array<{ name: string; className: string; grade: string }>,
  grade: string,
  studentsPerRoom: number,
  distributionStrategy: "last" | "separate" | "average"
): Array<Array<{ name: string; className: string; grade: string }>> {
  // 获取该年级的最小人数要求
  const minPerClassPerRoom =
    grade === "八年级" ? 4 : grade === "九年级" ? 5 : 0;

  // 按班级分组学生
  const studentsByClass = new Map<string, typeof students>();
  students.forEach((student) => {
    const className = String(student.className || "");
    if (!studentsByClass.has(className)) {
      studentsByClass.set(className, []);
    }
    studentsByClass.get(className)!.push(student);
  });

  // 计算需要的考场数量
  const totalStudents = students.length;
  const roomSizes = calculateRoomDistribution(
    totalStudents,
    studentsPerRoom,
    distributionStrategy
  );
  const numRooms = roomSizes.length;

  // 初始化每个考场的学生列表（按班级组织）
  const roomStudentsByClass: Array<Map<string, Array<(typeof students)[0]>>> =
    Array(numRooms)
      .fill(null)
      .map(() => new Map());

  // 如果不需要最小人数要求，直接随机分配
  if (minPerClassPerRoom === 0) {
    const shuffled = [...students].sort(() => Math.random() - 0.5);
    let index = 0;
    const roomStudents: Array<Array<(typeof students)[0]>> = Array(numRooms)
      .fill(null)
      .map(() => []);
    for (let roomIndex = 0; roomIndex < numRooms; roomIndex++) {
      const roomSize = roomSizes[roomIndex];
      roomStudents[roomIndex] = shuffled.slice(index, index + roomSize);
      index += roomSize;
    }
    return roomStudents;
  }

  // 需要满足最小人数要求的情况
  // 第一步：为每个班级分配学生到考场，确保每个考场至少有最小人数
  for (const [className, classStudents] of studentsByClass.entries()) {
    const shuffled = [...classStudents].sort(() => Math.random() - 0.5);
    const classSize = classStudents.length;

    // 计算该班级能分配到多少个考场（每个考场至少minPerClassPerRoom人）
    const maxRoomsForClass = Math.floor(classSize / minPerClassPerRoom);
    const actualRooms = Math.min(maxRoomsForClass, numRooms);

    if (actualRooms === 0) {
      // 如果班级人数不足以分配到任何考场，分配到第一个考场
      if (!roomStudentsByClass[0].has(className)) {
        roomStudentsByClass[0].set(className, []);
      }
      roomStudentsByClass[0].get(className)!.push(...shuffled);
    } else {
      // 为每个考场分配最小人数
      let studentIndex = 0;
      for (let roomIndex = 0; roomIndex < actualRooms; roomIndex++) {
        if (!roomStudentsByClass[roomIndex].has(className)) {
          roomStudentsByClass[roomIndex].set(className, []);
        }
        const allocated = shuffled.slice(
          studentIndex,
          studentIndex + minPerClassPerRoom
        );
        roomStudentsByClass[roomIndex].get(className)!.push(...allocated);
        studentIndex += minPerClassPerRoom;
      }

      // 如果还有剩余学生，分配到已有分配的考场中（轮询分配）
      while (studentIndex < shuffled.length && actualRooms > 0) {
        const roomIndex =
          (studentIndex - actualRooms * minPerClassPerRoom) % actualRooms;
        roomStudentsByClass[roomIndex]
          .get(className)!
          .push(shuffled[studentIndex]);
        studentIndex++;
      }
    }
  }

  // 第二步：将每个考场的学生合并成数组，同时保持班级信息
  const roomStudents: Array<Array<(typeof students)[0]>> = Array(numRooms)
    .fill(null)
    .map(() => []);

  // 保存每个考场中每个班级的学生数量（用于检查最小人数要求）
  const classCountsByRoom: Array<Map<string, number>> = Array(numRooms)
    .fill(null)
    .map(() => new Map());

  for (let roomIndex = 0; roomIndex < numRooms; roomIndex++) {
    for (const [className, classStudents] of roomStudentsByClass[
      roomIndex
    ].entries()) {
      roomStudents[roomIndex].push(...classStudents);
      classCountsByRoom[roomIndex].set(className, classStudents.length);
    }
    // 打乱该考场内的学生顺序
    roomStudents[roomIndex].sort(() => Math.random() - 0.5);
  }

  // 第三步：调整每个考场的人数，使其符合roomSizes要求
  // 在移动学生时，确保不违反最小人数要求
  for (let roomIndex = 0; roomIndex < numRooms; roomIndex++) {
    const maxSize = roomSizes[roomIndex];
    const currentSize = roomStudents[roomIndex].length;

    if (currentSize > maxSize) {
      // 超过容量，需要移走多余学生
      const excess = currentSize - maxSize;
      const studentsToMove: Array<(typeof students)[0]> = [];

      // 从后往前取学生，但要确保不破坏最小人数要求
      for (
        let i = roomStudents[roomIndex].length - 1;
        i >= 0 && studentsToMove.length < excess;
        i--
      ) {
        const student = roomStudents[roomIndex][i];
        const className = String(student.className || "");
        const currentCount = classCountsByRoom[roomIndex].get(className) || 0;

        // 如果移走这个学生后，该班级在该考场的人数仍然 >= minPerClassPerRoom，则可以移走
        if (currentCount > minPerClassPerRoom) {
          studentsToMove.unshift(student);
          roomStudents[roomIndex].splice(i, 1);
          classCountsByRoom[roomIndex].set(className, currentCount - 1);
        }
      }

      // 将多余学生移到下一个考场
      if (studentsToMove.length > 0 && roomIndex < numRooms - 1) {
        roomStudents[roomIndex + 1].unshift(...studentsToMove);
        // 更新下一个考场的班级计数
        studentsToMove.forEach((student) => {
          const className = String(student.className || "");
          const currentCount =
            classCountsByRoom[roomIndex + 1].get(className) || 0;
          classCountsByRoom[roomIndex + 1].set(className, currentCount + 1);
        });
      }
    }
  }

  // 第四步：如果某些考场人数不足，从后续考场补充
  // 但需要确保不违反最小人数要求
  for (let roomIndex = 0; roomIndex < numRooms; roomIndex++) {
    const currentSize = roomStudents[roomIndex].length;
    const targetSize = roomSizes[roomIndex];

    if (currentSize < targetSize) {
      const needed = targetSize - currentSize;

      // 从后续考场中寻找可以移动的学生
      for (
        let nextRoomIndex = roomIndex + 1;
        nextRoomIndex < numRooms;
        nextRoomIndex++
      ) {
        if (needed <= 0) break;

        const nextRoomStudents = roomStudents[nextRoomIndex];
        const nextRoomTargetSize = roomSizes[nextRoomIndex];
        const nextRoomCurrentSize = nextRoomStudents.length;

        // 计算可以移动的学生数量（不能超过目标容量，且不能破坏最小人数要求）
        const canMove = Math.min(
          needed,
          Math.max(0, nextRoomCurrentSize - nextRoomTargetSize)
        );

        // 进一步检查：确保移走学生后，每个班级仍然满足最小人数要求
        const studentsToMove: Array<(typeof students)[0]> = [];
        for (
          let i = nextRoomStudents.length - 1;
          i >= 0 && studentsToMove.length < canMove;
          i--
        ) {
          const student = nextRoomStudents[i];
          const className = String(student.className || "");
          const currentCount =
            classCountsByRoom[nextRoomIndex].get(className) || 0;

          // 如果移走这个学生后，该班级在该考场的人数仍然 >= minPerClassPerRoom，则可以移走
          if (currentCount > minPerClassPerRoom) {
            studentsToMove.unshift(student);
            nextRoomStudents.splice(i, 1);
            classCountsByRoom[nextRoomIndex].set(className, currentCount - 1);
          }
        }

        if (studentsToMove.length > 0) {
          roomStudents[roomIndex].push(...studentsToMove);
          // 更新当前考场的班级计数
          studentsToMove.forEach((student) => {
            const className = String(student.className || "");
            const currentCount =
              classCountsByRoom[roomIndex].get(className) || 0;
            classCountsByRoom[roomIndex].set(className, currentCount + 1);
          });
        }
      }
    }
  }

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
