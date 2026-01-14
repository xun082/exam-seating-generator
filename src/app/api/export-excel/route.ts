import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

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

interface SeatingArrangement {
  roomNumber: number;
  students: SeatAssignment[];
  grade?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { seatingArrangements, title = "考试座位表" } = await request.json();

    if (!Array.isArray(seatingArrangements)) {
      return NextResponse.json({ error: "座位表数据无效" }, { status: 400 });
    }

    // 创建工作簿
    const workbook = XLSX.utils.book_new();

    // 为每个试室创建工作表
    seatingArrangements.forEach(
      (room: SeatingArrangement) => {
        const { roomNumber, students, grade } = room;

        // 创建6×6布局的数据
        const data: (string | number)[][] = [];

        // 添加主标题
        const titleRow: (string | number)[] = [];
        titleRow.push(`${title}座位表(${students.length}人)`);
        for (let i = 1; i < 24; i++) {
          titleRow.push("");
        }
        data.push(titleRow);

        // 添加年级和试室号
        const roomRow: (string | number)[] = [];
        const gradeInfo = grade ? `${grade} - ` : '';
        roomRow.push(`${gradeInfo}试室号: ${String(roomNumber).padStart(2, "0")}`);
        for (let i = 1; i < 24; i++) {
          roomRow.push("");
        }
        data.push(roomRow);
        data.push([]); // 空行

        // 创建表头行（6组，每组4列）
        const headerRow: (string | number)[] = [];
        for (let col = 1; col <= 6; col++) {
          headerRow.push(
            `第${["一", "二", "三", "四", "五", "六"][col - 1]}组`
          );
          headerRow.push(""); // 空列（座号列标题）
          headerRow.push(""); // 空列（姓名列标题）
          headerRow.push(""); // 空列（班级列标题）
        }
        data.push(headerRow);

        // 创建列标题行（座号、姓名、班级、考号）
        const subHeaderRow: (string | number)[] = [];
        for (let col = 1; col <= 6; col++) {
          subHeaderRow.push("座号");
          subHeaderRow.push("姓名");
          subHeaderRow.push("班级");
          subHeaderRow.push("考号");
        }
        data.push(subHeaderRow);

        // 按列（组）组织数据
        const groups: SeatAssignment[][] = [[], [], [], [], [], []];
        students.forEach((seat) => {
          groups[seat.col - 1].push(seat);
        });

        // 按行排序
        groups.forEach((group) => {
          group.sort((a, b) => a.row - b.row);
        });

        // 创建6行数据
        for (let row = 0; row < 6; row++) {
          const dataRow: (string | number)[] = [];
          for (let col = 0; col < 6; col++) {
            const seat = groups[col][row];
            if (seat) {
              dataRow.push(seat.seatNumber.toString().padStart(2, "0")); // 座号
              dataRow.push(seat.name); // 姓名
              // 直接使用className，确保班级信息正确显示
              dataRow.push(String(seat.className || seat.grade || "")); // 班级
              dataRow.push(seat.examId); // 考号
            } else {
              dataRow.push("", "", "", "");
            }
          }
          data.push(dataRow);
        }

        // 创建工作表
        const worksheet = XLSX.utils.aoa_to_sheet(data);

        // 设置列宽（每组4列：座号、姓名、班级、考号）
        const colWidths: { wch: number }[] = [];
        for (let i = 0; i < 24; i++) {
          // 座号列窄一些，姓名、班级和考号列宽一些
          if (i % 4 === 0) {
            colWidths.push({ wch: 8 }); // 座号列
          } else if (i % 4 === 1) {
            colWidths.push({ wch: 12 }); // 姓名列
          } else if (i % 4 === 2) {
            colWidths.push({ wch: 10 }); // 班级列
          } else {
            colWidths.push({ wch: 14 }); // 考号列
          }
        }
        worksheet["!cols"] = colWidths;

        // 设置行高
        const rowHeights: { hpt: number }[] = [];
        for (let i = 0; i < data.length; i++) {
          if (i === 0) {
            rowHeights.push({ hpt: 25 }); // 标题行
          } else if (i === 1) {
            rowHeights.push({ hpt: 20 }); // 试室号行
          } else if (i === 3 || i === 4) {
            rowHeights.push({ hpt: 18 }); // 表头行
          } else {
            rowHeights.push({ hpt: 20 }); // 数据行
          }
        }
        worksheet["!rows"] = rowHeights;

        // 添加工作表到工作簿（包含年级信息以避免重名）
        const gradePrefix = grade ? `${grade}-` : '';
        const sheetName = `${gradePrefix}试室${String(roomNumber).padStart(2, "0")}`;
        XLSX.utils.book_append_sheet(
          workbook,
          worksheet,
          sheetName
        );
      }
    );

    // 按班级生成工作表
    // 收集每个班级的学生信息
    const classMaps = new Map<string, Array<{
      序号: number;
      姓名: string;
      年级: string;
      班别: string;
      考号: string;
      考场号: string;
      座位号: string;
    }>>();

    seatingArrangements.forEach((room: SeatingArrangement) => {
      room.students.forEach((student) => {
        const classKey = `${student.grade || '未知年级'}-${student.className || '未知班级'}`;
        
        if (!classMaps.has(classKey)) {
          classMaps.set(classKey, []);
        }
        
        classMaps.get(classKey)!.push({
          序号: classMaps.get(classKey)!.length + 1,
          姓名: student.name,
          年级: student.grade || '未知年级',
          班别: student.className || '未知班级',
          考号: student.examId,
          考场号: String(room.roomNumber).padStart(2, '0'),
          座位号: String(student.seatNumber).padStart(2, '0'),
        });
      });
    });

    // 按年级和班级排序
    const sortedClasses = Array.from(classMaps.entries()).sort((a, b) => {
      return a[0].localeCompare(b[0], 'zh-CN');
    });

    // 为每个班级创建工作表
    sortedClasses.forEach(([classKey, students]) => {
      const [grade, className] = classKey.split('-');
      
      // 按考场号和座位号排序
      students.sort((a, b) => {
        if (a.考场号 !== b.考场号) {
          return a.考场号.localeCompare(b.考场号);
        }
        return a.座位号.localeCompare(b.座位号);
      });

      // 重新编号
      students.forEach((student, index) => {
        student.序号 = index + 1;
      });

      // 创建数据数组
      const classData: (string | number)[][] = [];
      
      // 标题行
      classData.push([`${grade}${className}考场安排表`]);
      classData.push([]); // 空行
      
      // 表头
      classData.push(["序号", "姓名", "年级", "班别", "考号", "考场号", "座位号"]);
      
      // 数据行
      students.forEach((student) => {
        classData.push([
          student.序号,
          student.姓名,
          student.年级,
          student.班别,
          student.考号,
          student.考场号,
          student.座位号,
        ]);
      });

      // 创建工作表
      const classSheet = XLSX.utils.aoa_to_sheet(classData);
      
      // 设置列宽
      classSheet["!cols"] = [
        { wch: 8 },  // 序号
        { wch: 12 }, // 姓名
        { wch: 12 }, // 年级
        { wch: 10 }, // 班别
        { wch: 14 }, // 考号
        { wch: 10 }, // 考场号
        { wch: 10 }, // 座位号
      ];

      // 设置行高
      classSheet["!rows"] = [
        { hpt: 30 }, // 标题行高一些
        { hpt: 10 }, // 空行
        { hpt: 20 }, // 表头行
      ];

      // 工作表名称（包含年级信息，避免重复）
      const gradeShort = grade.replace('年级', ''); // 七年级 -> 七
      const sheetName = `${gradeShort}-${className}`;
      
      // 添加到工作簿最前面（在试室表之前）
      XLSX.utils.book_append_sheet(workbook, classSheet, sheetName);
    });

    // 生成Excel文件
    const excelBuffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    // 返回文件
    return new NextResponse(excelBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(
          title
        )}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("导出Excel错误:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "导出Excel失败",
      },
      { status: 500 }
    );
  }
}
