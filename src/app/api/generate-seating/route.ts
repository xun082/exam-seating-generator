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

// 按班级和最小人数要求分配学生到考场（优化版）
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

  console.log(`\n=== 开始分配 ${grade} ===`);
  console.log(`总学生数: ${totalStudents}, 考场数: ${numRooms}, 最小人数要求: ${minPerClassPerRoom}`);

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

  // 第一步：计算每个班级应该分配到多少个考场
  const classRoomAllocations = new Map<string, number>();
  
  for (const [className, classStudents] of studentsByClass.entries()) {
    const classSize = classStudents.length;
    // 该班级能分配到的最大考场数（确保每个考场至少有最小人数）
    const maxRoomsForClass = Math.floor(classSize / minPerClassPerRoom);
    // 实际分配的考场数（不能超过总考场数）
    const allocatedRooms = Math.min(maxRoomsForClass, numRooms);
    classRoomAllocations.set(className, allocatedRooms);
    
    console.log(`班级 ${className}: ${classSize}人, 可分配到 ${allocatedRooms} 个考场`);
  }

  // 第二步：为每个班级均匀分配学生到考场
  const roomStudentsByClass: Array<Map<string, Array<(typeof students)[0]>>> =
    Array(numRooms)
      .fill(null)
      .map(() => new Map());

  for (const [className, classStudents] of studentsByClass.entries()) {
    const shuffled = [...classStudents].sort(() => Math.random() - 0.5);
    const classSize = classStudents.length;
    const allocatedRooms = classRoomAllocations.get(className) || 0;

    if (allocatedRooms === 0) {
      // 人数不足，分配到第一个考场
      if (!roomStudentsByClass[0].has(className)) {
        roomStudentsByClass[0].set(className, []);
      }
      roomStudentsByClass[0].get(className)!.push(...shuffled);
      console.log(`班级 ${className} 人数不足，全部分配到考场1`);
    } else {
      // 均匀分配：计算每个考场应该分配多少人
      const basePerRoom = Math.floor(classSize / allocatedRooms);
      const remainder = classSize % allocatedRooms;

      let studentIndex = 0;
      for (let roomIndex = 0; roomIndex < allocatedRooms; roomIndex++) {
        // 前 remainder 个考场多分配1人
        const studentsInThisRoom = basePerRoom + (roomIndex < remainder ? 1 : 0);
        
        if (!roomStudentsByClass[roomIndex].has(className)) {
          roomStudentsByClass[roomIndex].set(className, []);
        }
        
        const allocated = shuffled.slice(studentIndex, studentIndex + studentsInThisRoom);
        roomStudentsByClass[roomIndex].get(className)!.push(...allocated);
        
        console.log(`班级 ${className} -> 考场${roomIndex + 1}: ${studentsInThisRoom}人`);
        
        studentIndex += studentsInThisRoom;
      }
    }
  }

  // 第三步：合并每个考场的学生
  const roomStudents: Array<Array<(typeof students)[0]>> = Array(numRooms)
    .fill(null)
    .map(() => []);

  for (let roomIndex = 0; roomIndex < numRooms; roomIndex++) {
    const classStudentsInRoom: Array<(typeof students)[0]> = [];
    
    for (const [className, classStudents] of roomStudentsByClass[roomIndex].entries()) {
      classStudentsInRoom.push(...classStudents);
    }
    
    // 打乱该考场内的学生顺序
    roomStudents[roomIndex] = classStudentsInRoom.sort(() => Math.random() - 0.5);
    
    console.log(`考场${roomIndex + 1} 总人数: ${roomStudents[roomIndex].length} (目标: ${roomSizes[roomIndex]})`);
  }

  // 第四步：微调以达到目标人数（如果有差异）
  // 这一步主要处理由于均匀分配导致的细微差异
  for (let roomIndex = 0; roomIndex < numRooms - 1; roomIndex++) {
    const currentSize = roomStudents[roomIndex].length;
    const targetSize = roomSizes[roomIndex];
    const diff = currentSize - targetSize;

    if (diff > 0) {
      // 当前考场人数过多，移动到下一个考场
      // 优先移动那些在当前考场人数较多的班级的学生
      const classCountsInRoom = new Map<string, number>();
      roomStudents[roomIndex].forEach(student => {
        const className = String(student.className || "");
        classCountsInRoom.set(className, (classCountsInRoom.get(className) || 0) + 1);
      });

      const studentsToMove: Array<(typeof students)[0]> = [];
      
      for (let i = roomStudents[roomIndex].length - 1; i >= 0 && studentsToMove.length < diff; i--) {
        const student = roomStudents[roomIndex][i];
        const className = String(student.className || "");
        const currentCount = classCountsInRoom.get(className) || 0;

        // 只有在移走后仍然满足最小人数要求时才移走
        if (currentCount > minPerClassPerRoom) {
          studentsToMove.unshift(student);
          roomStudents[roomIndex].splice(i, 1);
          classCountsInRoom.set(className, currentCount - 1);
        }
      }

      if (studentsToMove.length > 0) {
        roomStudents[roomIndex + 1].push(...studentsToMove);
        console.log(`从考场${roomIndex + 1}移动${studentsToMove.length}人到考场${roomIndex + 2}`);
      }
    }
  }

  console.log(`\n=== ${grade} 最终分配结果 ===`);
  roomStudents.forEach((students, index) => {
    const classBreakdown = new Map<string, number>();
    students.forEach(student => {
      const className = String(student.className || "");
      classBreakdown.set(className, (classBreakdown.get(className) || 0) + 1);
    });
    const breakdown = Array.from(classBreakdown.entries())
      .map(([cls, count]) => `${cls}:${count}人`)
      .join(", ");
    console.log(`考场${index + 1}: ${students.length}人 [${breakdown}]`);
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
