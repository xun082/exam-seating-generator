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

      // 跳过前3行（索引0, 1, 2），第4行（索引3）是表头
      if (jsonData.length < 4) {
        console.log("数据行数不足4行，跳过此工作表");
        return;
      }

      // 第4行（索引3）作为表头
      const headerRow = jsonData[3];
      if (!headerRow || !Array.isArray(headerRow)) {
        console.log("表头行无效，跳过此工作表");
        return;
      }

      const headers = headerRow.map((h) => String(h || "").trim());

      console.log("=== 表头信息（第4行） ===");
      console.log("表头数组:", headers);
      headers.forEach((h, i) => {
        console.log(`列${i}: "${h}"`);
      });

      // 固定索引：姓名在索引1，年级在索引5，班别在索引6
      const nameIndex = 1;
      const gradeIndex = 5;
      const classIndex = 6;

      console.log("=== 使用的列索引（固定） ===");
      console.log("姓名列索引:", nameIndex, `"${headers[nameIndex] || ""}"`);
      console.log("年级列索引:", gradeIndex, `"${headers[gradeIndex] || ""}"`);
      console.log("班别列索引:", classIndex, `"${headers[classIndex] || ""}"`);

      // 从第5行（索引4）开始解析数据
      for (let i = 4; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || !Array.isArray(row)) {
          continue;
        }

        // 确保索引在有效范围内
        if (row.length <= Math.max(nameIndex, gradeIndex, classIndex)) {
          continue;
        }

        // 直接提取数据
        const nameValue = row[nameIndex];
        const gradeValue = row[gradeIndex];
        const classValue = row[classIndex];

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
