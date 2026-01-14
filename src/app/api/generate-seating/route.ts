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

// 按班级和最小人数要求分配学生到考场（完全重写版）
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

  // 计算需要的考场数量和每个考场的目标人数
  const totalStudents = students.length;
  const roomSizes = calculateRoomDistribution(
    totalStudents,
    studentsPerRoom,
    distributionStrategy
  );
  const numRooms = roomSizes.length;

  console.log(`\n=== 开始分配 ${grade} ===`);
  console.log(`总学生数: ${totalStudents}, 考场数: ${numRooms}, 每考场目标人数: [${roomSizes.join(', ')}]`);
  console.log(`最小人数要求: ${minPerClassPerRoom}人/班/考场`);

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

  // === 新算法：基于考场容量的贪心分配 ===
  
  // 初始化每个考场的数据结构
  interface RoomData {
    students: Array<(typeof students)[0]>;
    classCounts: Map<string, number>;
    currentSize: number;
    targetSize: number;
  }
  
  const rooms: RoomData[] = roomSizes.map(size => ({
    students: [],
    classCounts: new Map(),
    currentSize: 0,
    targetSize: size,
  }));

  // 为每个班级的学生打乱顺序
  const shuffledByClass = new Map<string, Array<(typeof students)[0]>>();
  for (const [className, classStudents] of studentsByClass.entries()) {
    shuffledByClass.set(className, [...classStudents].sort(() => Math.random() - 0.5));
  }

  console.log('\n班级人数统计:');
  for (const [className, classStudents] of shuffledByClass.entries()) {
    console.log(`  班级 ${className}: ${classStudents.length}人`);
  }

  // 第一阶段：为每个班级分配最小人数到每个可用的考场
  console.log('\n第一阶段：分配最小人数');
  for (const [className, classStudents] of shuffledByClass.entries()) {
    const classSize = classStudents.length;
    // 该班能分配到多少个考场（确保每个考场至少minPerClassPerRoom人）
    const maxRoomsForClass = Math.floor(classSize / minPerClassPerRoom);
    const allocatedRooms = Math.min(maxRoomsForClass, numRooms);
    
    console.log(`  班级 ${className}: 分配到 ${allocatedRooms} 个考场`);

    if (allocatedRooms === 0) {
      // 人数不足，全部放第一个考场
      rooms[0].students.push(...classStudents);
      rooms[0].classCounts.set(className, classStudents.length);
      rooms[0].currentSize += classStudents.length;
    } else {
      // 为每个分配的考场分配最小人数
      let studentIndex = 0;
      for (let roomIndex = 0; roomIndex < allocatedRooms && studentIndex < classSize; roomIndex++) {
        const studentsToAdd = classStudents.slice(studentIndex, studentIndex + minPerClassPerRoom);
        rooms[roomIndex].students.push(...studentsToAdd);
        rooms[roomIndex].classCounts.set(className, studentsToAdd.length);
        rooms[roomIndex].currentSize += studentsToAdd.length;
        studentIndex += minPerClassPerRoom;
        console.log(`    考场${roomIndex + 1}: +${studentsToAdd.length}人`);
      }
      
      // 剩余学生暂存
      shuffledByClass.set(className, classStudents.slice(studentIndex));
    }
  }

  // 第二阶段：分配剩余学生，优先填充容量不足的考场
  console.log('\n第二阶段：分配剩余学生');
  
  // 收集所有剩余学生
  const remainingStudents: Array<(typeof students)[0]> = [];
  for (const [className, classStudents] of shuffledByClass.entries()) {
    if (classStudents.length > 0) {
      console.log(`  班级 ${className} 剩余: ${classStudents.length}人`);
      remainingStudents.push(...classStudents);
    }
  }
  
  // 打乱剩余学生
  remainingStudents.sort(() => Math.random() - 0.5);
  
  console.log(`  总剩余学生: ${remainingStudents.length}人`);

  // 按考场容量缺口大小排序，优先填充缺口大的考场
  for (const student of remainingStudents) {
    const studentClassName = String(student.className || "");
    
    // 找到最合适的考场：
    // 1. 优先选择容量不足的考场
    // 2. 在满足最小人数要求的前提下，选择该班级人数最少的考场
    let bestRoomIndex = -1;
    let bestScore = -Infinity;
    
    for (let roomIndex = 0; roomIndex < numRooms; roomIndex++) {
      const room = rooms[roomIndex];
      const classCount = room.classCounts.get(studentClassName) || 0;
      const capacityGap = room.targetSize - room.currentSize;
      
      // 跳过已满的考场
      if (capacityGap <= 0) continue;
      
      // 计算分数：容量缺口越大越优先，该班级人数越少越优先
      const score = capacityGap * 1000 - classCount;
      
      if (score > bestScore) {
        bestScore = score;
        bestRoomIndex = roomIndex;
      }
    }
    
    // 如果找不到合适的考场（所有考场都满了），放到最后一个考场
    if (bestRoomIndex === -1) {
      bestRoomIndex = numRooms - 1;
    }
    
    // 分配学生
    rooms[bestRoomIndex].students.push(student);
    const currentCount = rooms[bestRoomIndex].classCounts.get(studentClassName) || 0;
    rooms[bestRoomIndex].classCounts.set(studentClassName, currentCount + 1);
    rooms[bestRoomIndex].currentSize += 1;
  }

  // 第三阶段：最终调整，确保每个考场人数接近目标
  console.log('\n第三阶段：最终调整');
  for (let roomIndex = 0; roomIndex < numRooms - 1; roomIndex++) {
    const room = rooms[roomIndex];
    const diff = room.currentSize - room.targetSize;
    
    if (diff > 0) {
      // 当前考场人数过多，需要移走一些学生
      console.log(`  考场${roomIndex + 1}超额${diff}人，尝试移动...`);
      
      const studentsToMove: Array<(typeof students)[0]> = [];
      
      // 从后往前遍历学生，优先移走那些班级人数超过最小要求的
      for (let i = room.students.length - 1; i >= 0 && studentsToMove.length < diff; i--) {
        const student = room.students[i];
        const className = String(student.className || "");
        const classCount = room.classCounts.get(className) || 0;
        
        // 只有在移走后仍然满足最小人数要求时才移走
        if (classCount > minPerClassPerRoom) {
          studentsToMove.push(student);
          room.students.splice(i, 1);
          room.classCounts.set(className, classCount - 1);
          room.currentSize -= 1;
        }
      }
      
      // 将学生移到下一个考场
      if (studentsToMove.length > 0) {
        const nextRoom = rooms[roomIndex + 1];
        nextRoom.students.push(...studentsToMove);
        nextRoom.currentSize += studentsToMove.length;
        studentsToMove.forEach(student => {
          const className = String(student.className || "");
          const count = nextRoom.classCounts.get(className) || 0;
          nextRoom.classCounts.set(className, count + 1);
        });
        console.log(`    实际移动${studentsToMove.length}人到考场${roomIndex + 2}`);
      }
    }
  }

  // 打乱每个考场内的学生顺序
  rooms.forEach(room => {
    room.students.sort(() => Math.random() - 0.5);
  });

  // 输出最终结果
  console.log(`\n=== ${grade} 最终分配结果 ===`);
  rooms.forEach((room, index) => {
    const breakdown = Array.from(room.classCounts.entries())
      .map(([cls, count]) => `${cls}:${count}`)
      .join(", ");
    console.log(`考场${index + 1}: ${room.currentSize}人 (目标:${room.targetSize}) [${breakdown}]`);
  });

  return rooms.map(room => room.students);
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
