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

export async function POST(request: NextRequest) {
  try {
    const { students, prefix = "07011" } = await request.json();

    if (!Array.isArray(students) || students.length === 0) {
      return NextResponse.json({ error: "学生数据无效" }, { status: 400 });
    }

    // 随机打乱学生顺序
    const shuffledStudents = [...students].sort(() => Math.random() - 0.5);

    // 计算需要的试室数量（每试室36人）
    const studentsPerRoom = 36;
    const totalRooms = Math.ceil(shuffledStudents.length / studentsPerRoom);

    const seatingArrangements: Array<{
      roomNumber: number;
      students: SeatAssignment[];
    }> = [];

    // 为每个试室分配座位
    for (let roomIndex = 0; roomIndex < totalRooms; roomIndex++) {
      const roomNumber = roomIndex + 1;
      const roomStudents = shuffledStudents.slice(
        roomIndex * studentsPerRoom,
        (roomIndex + 1) * studentsPerRoom
      );

      const seats: SeatAssignment[] = [];

      // 6×6布局，按列（组）分配
      for (let col = 0; col < 6; col++) {
        for (let row = 0; row < 6; row++) {
          const seatIndex = col * 6 + row;
          const student = roomStudents[seatIndex];

          if (student) {
            const seatNumber = seatIndex + 1;
            const examId = `${prefix}${String(roomNumber).padStart(
              2,
              "0"
            )}${String(seatNumber).padStart(2, "0")}`;

            // 直接传递所有数据，确保班级信息不丢失
            seats.push({
              seatNumber,
              name: String(student.name || ""),
              examId,
              roomNumber,
              row: row + 1,
              col: col + 1,
              className: String(student.className || ""),
              grade: String(student.grade || ""),
            });

            // 打印前3个座位用于调试
            if (seats.length <= 3) {
              console.log(`=== 座位${seats.length} ===`);
              console.log("学生对象:", student);
              console.log("座位对象:", {
                seatNumber,
                name: student.name,
                className: student.className,
                grade: student.grade,
                examId,
              });
            }
          }
        }
      }

      seatingArrangements.push({
        roomNumber,
        students: seats,
      });
    }

    return NextResponse.json({
      success: true,
      seatingArrangements,
      totalStudents: shuffledStudents.length,
      totalRooms,
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
