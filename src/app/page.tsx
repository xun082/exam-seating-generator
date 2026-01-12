'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState, useMemo, useEffect } from 'react';
import React from 'react';

interface Student {
  name: string;
  grade: string;
  className: string;
}

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
}

export default function Home() {
  const [students, setStudents] = useState<Student[]>([]);
  const [seatingArrangements, setSeatingArrangements] = useState<SeatingArrangement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [prefix, setPrefix] = useState('07011');
  const [examTitle, setExamTitle] = useState('2025年秋季七年级期末质量监测');

  // 从localStorage加载数据
  useEffect(() => {
    const savedStudents = localStorage.getItem('students');
    const savedSeating = localStorage.getItem('seatingArrangements');
    const savedPrefix = localStorage.getItem('prefix');
    const savedTitle = localStorage.getItem('examTitle');
    
    if (savedStudents) {
      setStudents(JSON.parse(savedStudents));
    }
    if (savedSeating) {
      setSeatingArrangements(JSON.parse(savedSeating));
    }
    if (savedPrefix) {
      setPrefix(savedPrefix);
    }
    if (savedTitle) {
      setExamTitle(savedTitle);
    }
  }, []);

  // 使用自定义验证，避免在服务端使用FileList
  const excelSchema = useMemo(() => {
    return z.object({
      file: z.any().refine(
        (files) => {
          if (!files || typeof files === 'undefined') {
            return false;
          }
          if (typeof files.length === 'number' && files.length > 0) {
            return true;
          }
          return false;
        },
        '请选择文件'
      ).refine(
        (files) => {
          if (!files || typeof files === 'undefined' || files.length === 0) {
            return false;
          }
          const file = files[0];
          if (!file) {
            return false;
          }
          const validTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv'
          ];
          const fileType = file.type || '';
          const fileName = file.name || '';
          return validTypes.includes(fileType) || 
                 fileName.endsWith('.xlsx') || 
                 fileName.endsWith('.xls') || 
                 fileName.endsWith('.csv');
        },
        '请上传Excel文件 (.xlsx, .xls, .csv)'
      ),
    });
  }, []);

  type ExcelFormData = z.infer<typeof excelSchema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<ExcelFormData>({
    resolver: zodResolver(excelSchema),
  });

  const fileInput = watch('file');

  // 上传并解析学生数据
  const handleFileRead = async (file: File) => {
    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload-excel', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      // 打印API返回的完整数据结构
      console.log('=== API返回的完整数据结构 ===');
      console.log('result:', result);
      console.log('result.success:', result.success);
      console.log('result.students类型:', typeof result.students);
      console.log('result.students是否为数组:', Array.isArray(result.students));
      if (result.students && Array.isArray(result.students)) {
        console.log('学生数量:', result.students.length);
        console.log('前3名学生数据结构:', result.students.slice(0, 3));
        result.students.slice(0, 3).forEach((student: Student, index: number) => {
          console.log(`学生${index + 1}:`, {
            name: student.name,
            grade: student.grade,
            className: student.className,
            '所有字段': Object.keys(student),
            '完整对象': student
          });
        });
      }
      if (result.debug) {
        console.log('=== 调试信息 ===');
        console.log('表头:', result.debug.headers);
        console.log('示例数据:', result.debug.sample);
      }

      if (!response.ok) {
        throw new Error(result.error || '上传失败');
      }

      if (result.success && result.students && Array.isArray(result.students)) {
        if (result.students.length === 0) {
          throw new Error('Excel文件中没有找到学生数据，请检查文件格式');
        }
        
        // 打印保存前的数据
        console.log('=== 准备保存到state和localStorage ===');
        console.log('学生数据:', result.students);
        
        setStudents(result.students);
        localStorage.setItem('students', JSON.stringify(result.students));
        
        // 打印保存后的验证
        console.log('=== 保存后验证 ===');
        const saved = localStorage.getItem('students');
        console.log('localStorage中的数据:', saved ? JSON.parse(saved).slice(0, 3) : 'null');
        
        // 清空之前的座位表，因为学生数据已更新
        setSeatingArrangements([]);
        localStorage.removeItem('seatingArrangements');
      } else {
        throw new Error('服务器返回数据格式错误');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '读取Excel文件失败';
      setError(errorMessage);
      console.error('读取Excel文件错误:', err);
      // 如果出错，不清空已有数据
    } finally {
      setLoading(false);
    }
  };

  // 生成座位表
  const generateSeating = async () => {
    if (students.length === 0) {
      setError('请先上传学生数据');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/generate-seating', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          students,
          prefix,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '生成座位表失败');
      }

      if (result.success && result.seatingArrangements) {
        // 打印座位表数据结构
        console.log('=== 座位表数据结构 ===');
        console.log('座位表数量:', result.seatingArrangements.length);
        if (result.seatingArrangements.length > 0) {
          const firstRoom = result.seatingArrangements[0];
          console.log('第一个试室数据结构:', {
            roomNumber: firstRoom.roomNumber,
            studentsCount: firstRoom.students?.length,
            '前3个学生': firstRoom.students?.slice(0, 3).map((s: SeatAssignment) => ({
              seatNumber: s.seatNumber,
              name: s.name,
              className: s.className,
              grade: s.grade,
              examId: s.examId,
              '所有字段': Object.keys(s)
            }))
          });
        }
        
        setSeatingArrangements(result.seatingArrangements);
        localStorage.setItem('seatingArrangements', JSON.stringify(result.seatingArrangements));
        localStorage.setItem('prefix', prefix);
        localStorage.setItem('examTitle', examTitle);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成座位表失败');
      console.error('生成座位表错误:', err);
    } finally {
      setLoading(false);
    }
  };

  // 导出为Excel
  const exportToExcel = async () => {
    if (seatingArrangements.length === 0) {
      setError('请先生成座位表');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/export-excel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          seatingArrangements,
          title: examTitle,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '导出失败');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const fileName = `${examTitle || '考试座位表'}.xlsx`;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      // 显示成功提示
      const successMsg = `Excel文件已成功导出：${fileName}`;
      console.log(successMsg);
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出Excel失败');
      console.error('导出Excel错误:', err);
    } finally {
      setLoading(false);
    }
  };


  const onSubmit = async (data: ExcelFormData) => {
    if (!data.file || data.file.length === 0) {
      setError('请选择文件');
      return;
    }
    const file = data.file[0];
    if (!file) {
      setError('文件无效');
      return;
    }
    await handleFileRead(file);
    reset();
  };

  // 渲染座位表（6×6布局，6组）
  const renderSeatingTable = (arrangement: SeatingArrangement) => {
    const { roomNumber, students } = arrangement;
    
    // 按列（组）组织数据
    const groups: SeatAssignment[][] = [[], [], [], [], [], []];
    students.forEach(seat => {
      groups[seat.col - 1].push(seat);
    });

    // 按行排序
    groups.forEach(group => {
      group.sort((a, b) => a.row - b.row);
    });

    return (
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-200">
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold mb-2 text-gray-900">
            {examTitle}座位表
          </h2>
          <div className="flex items-center justify-center gap-4 text-gray-600">
            <span className="flex items-center">
              <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              试室号: <span className="font-bold text-blue-600 ml-1">{String(roomNumber).padStart(2, '0')}</span>
            </span>
            <span className="text-gray-300">|</span>
            <span className="flex items-center">
              <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              共 <span className="font-bold text-green-600 ml-1">{students.length}</span> 人
            </span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border-2 border-gray-300">
          <table className="w-full border-collapse bg-white">
            <thead>
              <tr className="bg-gradient-to-r from-gray-100 to-gray-50">
                {[1, 2, 3, 4, 5, 6].map((groupNum) => (
                  <th
                    key={groupNum}
                    colSpan={4}
                    className="border-2 border-gray-400 bg-blue-50 px-3 py-3 text-center font-bold text-gray-800 text-base"
                  >
                    第{['一', '二', '三', '四', '五', '六'][groupNum - 1]}组
                  </th>
                ))}
              </tr>
              <tr className="bg-gray-50">
                {[1, 2, 3, 4, 5, 6].map((groupNum) => (
                  <React.Fragment key={groupNum}>
                    <th className="border border-gray-300 bg-gray-100 px-3 py-2 text-center text-sm font-bold text-gray-700">
                      座号
                    </th>
                    <th className="border border-gray-300 bg-gray-100 px-3 py-2 text-center text-sm font-bold text-gray-700">
                      姓名
                    </th>
                    <th className="border border-gray-300 bg-gray-100 px-3 py-2 text-center text-sm font-bold text-gray-700">
                      班级
                    </th>
                    <th className="border border-gray-300 bg-gray-100 px-3 py-2 text-center text-sm font-bold text-gray-700">
                      考号
                    </th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3, 4, 5].map((rowIndex) => (
                <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  {groups.map((group, groupIndex) => {
                    const seat = group[rowIndex];
                    return (
                      <React.Fragment key={`${groupIndex}-${rowIndex}`}>
                        <td className="border border-gray-300 px-3 py-3 text-center text-sm text-gray-800 font-medium">
                          {seat ? String(seat.seatNumber).padStart(2, '0') : ''}
                        </td>
                        <td className="border border-gray-300 px-3 py-3 text-center text-sm text-gray-900 font-semibold">
                          {seat ? seat.name : ''}
                        </td>
                        <td className="border border-gray-300 px-3 py-3 text-center text-sm text-blue-700 font-medium">
                          {seat ? String(seat.className || seat.grade || '') : ''}
                        </td>
                        <td className="border border-gray-300 px-3 py-3 text-center text-sm text-gray-700 font-mono">
                          {seat ? seat.examId : ''}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 标题区域 */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            考试座位表生成系统
          </h1>
          <p className="text-gray-600 text-lg">
            快速生成标准化的考试座位安排表
          </p>
        </div>

        {/* 配置区域 */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            考试配置
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                考号前缀
              </label>
              <input
                type="text"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg 
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 
                  transition-all bg-white text-gray-900 placeholder:text-gray-400
                  font-medium"
                placeholder="07011"
              />
              <p className="mt-2 text-xs text-gray-600 font-medium">格式：07011 + 试室号(01) + 座号(01-36)</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                考试标题
              </label>
              <input
                type="text"
                value={examTitle}
                onChange={(e) => setExamTitle(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg 
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 
                  transition-all bg-white text-gray-900 placeholder:text-gray-400
                  font-medium"
                placeholder="2025年秋季七年级期末质量监测"
              />
            </div>
          </div>
        </div>

        {/* 文件上传表单 */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            数据上传
          </h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label 
                htmlFor="file" 
                className="block text-sm font-semibold text-gray-700 mb-3"
              >
                上传学生Excel文件
              </label>
              <div className="relative">
                <input
                  id="file"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  {...register('file', {
                    onChange: () => {
                      setError('');
                    }
                  })}
                  className="block w-full text-sm text-gray-700
                    file:mr-4 file:py-3 file:px-6
                    file:rounded-lg file:border-0
                    file:text-sm file:font-semibold
                    file:bg-blue-600 file:text-white
                    hover:file:bg-blue-700
                    file:transition-colors
                    file:cursor-pointer
                    file:shadow-md
                    cursor-pointer
                    border-2 border-dashed border-gray-400 rounded-lg p-4
                    hover:border-blue-500 transition-colors bg-gray-50"
                />
              </div>
              {fileInput && fileInput.length > 0 && (
                <div className="mt-3 flex items-center text-sm text-gray-900 bg-blue-50 rounded-lg p-3 border border-blue-200">
                  <svg className="w-5 h-5 text-blue-700 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="font-semibold text-gray-900">已选择:</span>
                  <span className="ml-2 font-medium text-gray-800">{fileInput[0].name}</span>
                </div>
              )}
              {errors.file && (
                <p className="mt-2 text-sm text-red-600 flex items-center">
                  <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {typeof errors.file.message === 'string' ? errors.file.message : '请选择文件'}
                </p>
              )}
              <p className="mt-2 text-xs text-gray-700 font-medium bg-gray-50 rounded-md p-2">
                📋 文件格式要求：第4行为表头（序号、姓名、身份证号、就读学校、就读阶段、年级、班别），第5行开始为数据
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-lg
                  hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed
                  transition-all font-semibold shadow-md hover:shadow-lg
                  flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    上传中...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    上传学生数据
                  </>
                )}
              </button>
              {students.length > 0 && (
                <button
                  type="button"
                  onClick={generateSeating}
                  disabled={loading}
                  className="flex-1 bg-green-600 text-white py-3 px-6 rounded-lg
                    hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed
                    transition-all font-semibold shadow-md hover:shadow-lg
                    flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      生成中...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      生成座位表 ({students.length}人)
                    </>
                  )}
                </button>
              )}
            </div>
          </form>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="bg-red-50 border-2 border-red-300 text-red-800 px-6 py-4 rounded-lg mb-6 shadow-sm">
            <div className="flex items-start">
              <div className="shrink-0">
                <svg className="h-5 w-5 text-red-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-semibold text-red-800 mb-1">上传失败</h3>
                <p className="text-sm text-red-700">{error}</p>
              </div>
              <button
                onClick={() => setError('')}
                className="ml-4 shrink-0 text-red-600 hover:text-red-800"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* 学生数据统计 */}
        {students.length > 0 && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl shadow-md p-5 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="bg-green-500 rounded-full p-2 mr-3">
                  <svg className="h-6 w-6 text-white" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">数据加载成功</p>
                  <p className="text-lg font-bold text-green-700">
                    {students.length} 名学生数据已就绪
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">可生成</p>
                <p className="text-lg font-bold text-green-700">
                  {Math.ceil(students.length / 36)} 个试室
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 座位表显示和导出 */}
        {seatingArrangements.length > 0 && (
          <div className="mb-6">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-lg p-6 mb-6">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center text-white">
                  <div className="bg-white bg-opacity-20 rounded-lg p-3 mr-4">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm opacity-90">座位表已生成</p>
                    <p className="text-xl font-bold">共 {seatingArrangements.length} 个试室</p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={generateSeating}
                    disabled={loading}
                    className="bg-yellow-500 text-white py-3 px-6 rounded-lg
                      hover:bg-yellow-600 disabled:bg-gray-400 disabled:text-gray-300
                      transition-all font-semibold shadow-lg hover:shadow-xl
                      flex items-center justify-center whitespace-nowrap
                      disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        重新生成中...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        重新生成
                      </>
                    )}
                  </button>
                  <button
                    onClick={exportToExcel}
                    disabled={loading}
                    className="bg-white text-blue-600 py-3 px-8 rounded-lg
                      hover:bg-gray-50 disabled:bg-gray-200 disabled:text-gray-400
                      transition-all font-semibold text-lg shadow-lg
                      hover:shadow-xl flex items-center gap-2 whitespace-nowrap
                      disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        导出中...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        导出Excel文档
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {seatingArrangements.map((arrangement) => (
                <div key={arrangement.roomNumber}>
                  {renderSeatingTable(arrangement)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 空状态提示 */}
        {!loading && students.length === 0 && seatingArrangements.length === 0 && !error && (
          <div className="bg-white rounded-xl shadow-lg p-16 text-center border border-gray-200">
            <div className="max-w-md mx-auto">
              <div className="bg-blue-100 rounded-full p-6 w-24 h-24 mx-auto mb-6 flex items-center justify-center">
                <svg className="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">开始使用</h3>
              <p className="text-gray-700 mb-4 font-medium">
                请上传学生Excel文件开始生成座位表
              </p>
              <div className="text-sm text-gray-700 space-y-2 font-medium">
                <p className="bg-gray-50 rounded-md p-2">📋 文件格式：第4行为表头，第5行开始为数据</p>
                <p className="bg-gray-50 rounded-md p-2">✅ 需包含：姓名、年级、班别列</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
