import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

interface Student {
  name: string;
  grade: string;
  className: string;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "未找到文件" }, { status: 400 });
    }

    // 验证文件类型
    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];
    const fileType = file.type || "";
    const fileName = file.name || "";

    const isValidType =
      validTypes.includes(fileType) ||
      fileName.endsWith(".xlsx") ||
      fileName.endsWith(".xls") ||
      fileName.endsWith(".csv");

    if (!isValidType) {
      return NextResponse.json(
        { error: "请上传Excel文件 (.xlsx, .xls, .csv)" },
        { status: 400 }
      );
    }

    // 读取文件
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });

    // 解析学生数据
    const students: Student[] = [];

    // 遍历所有工作表
    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
      }) as (string | number | boolean | null)[][];

      if (jsonData.length === 0) {
        return;
      }

      console.log("=== Excel原始数据 ===");
      console.log(`工作表: ${sheetName}`);
      console.log(`总行数: ${jsonData.length}`);
      console.log("前5行数据:", jsonData.slice(0, 5));

      // 自动检测表头位置
      let headerRowIndex = -1;
      let dataStartIndex = -1;
      
      // 查找包含"姓名"或"年级"或"班"的表头行
      for (let i = 0; i < Math.min(10, jsonData.length); i++) {
        const row = jsonData[i];
        if (Array.isArray(row)) {
          const rowStr = row.map(cell => String(cell || "").toLowerCase()).join("");
          if (rowStr.includes("姓名") || (rowStr.includes("年级") && rowStr.includes("班"))) {
            headerRowIndex = i;
            dataStartIndex = i + 1;
            break;
          }
        }
      }
      
      // 如果没找到表头，使用默认值（兼容旧格式：第4行是表头）
      if (headerRowIndex === -1) {
        if (jsonData.length < 4) {
          console.log("数据行数不足，跳过此工作表");
          return;
        }
        headerRowIndex = 3; // 第4行
        dataStartIndex = 4; // 第5行
      }

      console.log("=== 自动检测到的表头位置 ===");
      console.log("表头行索引:", headerRowIndex, "(第", headerRowIndex + 1, "行)");
      console.log("数据起始行:", dataStartIndex, "(第", dataStartIndex + 1, "行)");

      const headerRow = jsonData[headerRowIndex];
      if (!headerRow || !Array.isArray(headerRow)) {
        console.log("表头行无效，跳过此工作表");
        return;
      }

      const headers = headerRow.map((h) => String(h || "").trim());

      console.log("=== 表头信息 ===");
      console.log("表头数组:", headers);
      headers.forEach((h, i) => {
        console.log(`列${i}: "${h}"`);
      });

      // 自动查找列索引
      let nameIndex = -1;
      let gradeIndex = -1;
      let classIndex = -1;

      headers.forEach((cell, index) => {
        const cellLower = cell.toLowerCase();
        if (cellLower === "姓名" || cellLower.includes("姓名")) {
          nameIndex = index;
        } else if (cellLower === "年级" || cellLower.includes("年级")) {
          gradeIndex = index;
        } else if (cellLower === "班" || cellLower === "班别" || cellLower === "班级" || cellLower.includes("班")) {
          classIndex = index;
        }
      });

      // 如果自动检测失败，使用固定索引（兼容旧格式）
      const finalNameIndex = nameIndex !== -1 ? nameIndex : 1;
      const finalGradeIndex = gradeIndex !== -1 ? gradeIndex : 5;
      const finalClassIndex = classIndex !== -1 ? classIndex : 6;

      console.log("=== 最终使用的列索引 ===");
      console.log("姓名列索引:", finalNameIndex, `"${headers[finalNameIndex] || ""}"`);
      console.log("年级列索引:", finalGradeIndex, `"${headers[finalGradeIndex] || ""}"`);
      console.log("班别列索引:", finalClassIndex, `"${headers[finalClassIndex] || ""}"`);

      // 从数据起始行开始解析
      for (let i = dataStartIndex; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || !Array.isArray(row)) {
          continue;
        }

        // 确保索引在有效范围内
        if (row.length <= Math.max(finalNameIndex, finalGradeIndex, finalClassIndex)) {
          continue;
        }

        // 直接提取数据
        const nameValue = row[finalNameIndex];
        const gradeValue = row[finalGradeIndex];
        const classValue = row[finalClassIndex];

        const name = String(nameValue || "").trim();
        const grade = String(gradeValue || "").trim();
        const className = String(classValue || "").trim();

        // 只要姓名不为空就添加
        if (name) {
          const student: Student = {
            name,
            grade,
            className,
          };

          students.push(student);

          // 打印前5条数据用于调试
          if (students.length <= 5) {
            console.log(`=== 第${i + 1}行数据（学生${students.length}） ===`);
            console.log("原始行数据:", row);
            console.log("提取的原始值:", {
              nameValue,
              gradeValue,
              classValue,
            });
            console.log("提取的值:", {
              name: `"${name}"`,
              grade: `"${grade}"`,
              className: `"${className}"`,
            });
            console.log("解析结果对象:", student);
          }
        }
      }
    });

    // 检查是否解析到学生数据
    if (students.length === 0) {
      return NextResponse.json(
        {
          error:
            "未能从Excel文件中解析到学生数据。请确保文件格式正确：第4行为表头，第5行开始为数据。",
        },
        { status: 400 }
      );
    }

    // 打印解析结果摘要
    console.log("=== 解析结果摘要 ===");
    console.log(`共解析 ${students.length} 名学生`);
    console.log("前3名学生数据:", students.slice(0, 3));
    const withClass = students.filter(
      (s) => s.className && s.className.length > 0
    ).length;
    const withGrade = students.filter(
      (s) => s.grade && s.grade.length > 0
    ).length;
    console.log(`有班级信息的学生: ${withClass}/${students.length}`);
    console.log(`有年级信息的学生: ${withGrade}/${students.length}`);

    return NextResponse.json({
      success: true,
      students,
      count: students.length,
      debug: {
        headers:
          workbook.SheetNames.length > 0
            ? (() => {
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const firstSheetData = XLSX.utils.sheet_to_json(firstSheet, {
                  header: 1,
                  defval: "",
                }) as (string | number | boolean | null)[][];
                const headerRow = firstSheetData[3];
                return Array.isArray(headerRow)
                  ? (headerRow.map((h) => String(h || "").trim()) as string[])
                  : [];
              })()
            : [],
        sample: students.slice(0, 3),
      },
    });
  } catch (error) {
    console.error("读取Excel文件错误:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "读取Excel文件失败",
      },
      { status: 500 }
    );
  }
}
