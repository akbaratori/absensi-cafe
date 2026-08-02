import { useState, useEffect } from 'react';
import { BarChart3, Download, Calendar, Users, Filter } from 'lucide-react';
import Card from '../../components/shared/Card';
import Button from '../../components/shared/Button';
import { getDailyReport, getMonthlyReport, exportReport } from '../../services/attendanceService';
import { getUsers } from '../../services/adminService';
import { formatDate } from '../../utils/formatters';

const ReportsPage = () => {
  const [reportType, setReportType] = useState('daily');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [employees, setEmployees] = useState([]);

  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Fetch employees on mount
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const response = await getUsers({ limit: 100 });
        setEmployees(response.data.users || []);
      } catch (error) {
        console.error('Failed to fetch employees:', error);
      }
    };
    fetchEmployees();
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    try {
      let response;
      const params = selectedEmployee ? { userId: selectedEmployee } : {};

      if (reportType === 'daily') {
        // Daily Report always fetches all for the date, we filter client-side if employee selected
        // unless backend supports it. Currently backend getDailySummary only accepts date.
        // So we fetch all and filter in frontend for now to be safe.
        response = await getDailyReport({ date: selectedDate });

        if (selectedEmployee && response.data) {
          // Client-side filtering for Daily Report
          const filteredRecords = (response.data.records || []).filter(r => r.user.id === parseInt(selectedEmployee));

          // Recalculate summary for single user
          const isPresent = filteredRecords.some(r => r.status === 'PRESENT');
          const isLate = filteredRecords.some(r => r.status === 'LATE');
          const isAbsent = filteredRecords.some(r => r.status === 'ABSENT');

          response.data = {
            ...response.data,
            summary: {
              totalEmployees: 1,
              present: isPresent ? 1 : 0,
              late: isLate ? 1 : 0,
              absent: isAbsent ? 1 : 0,
              // Keep other stats compatible
            },
            records: filteredRecords
          };
        }
      } else {
        // Monthly Report supports server-side filtering
        response = await getMonthlyReport({ month: selectedMonth, ...params });

        // Normalize single user response (which has dailyBreakdown) to match table format (records)
        response = await getMonthlyReport({
          month: selectedMonth,
          userId: selectedEmployee || undefined // Monthly report requires userId usually, or we default?
        });

        // Standardize structure: backend returns 'dailyBreakdown', frontend expects 'records'
        if (response.data && response.data.dailyBreakdown) {
          response.data.records = response.data.dailyBreakdown.map(record => ({
            ...record,
            user: response.data.user // Add user info to each record for table rendering
          }));
        }
      }
      setReportData(response.data);
    } catch (error) {
      console.error('Failed to fetch report:', error);
      setReportData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = reportType === 'daily'
        ? { startDate: selectedDate, endDate: selectedDate }
        : {
          startDate: selectedMonth + '-01',
          endDate: selectedMonth + '-31',
        };

      if (selectedEmployee) params.userId = selectedEmployee;

      const response = await exportReport(params);

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `attendance_report_${reportType}_${selectedDate || selectedMonth}${selectedEmployee ? '_' + selectedEmployee : ''}.csv`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Failed to export report:', error);
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [reportType, selectedDate, selectedMonth, selectedEmployee]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-600 mt-1">Generate and export attendance reports</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={handleExport}
            loading={exporting}
            disabled={!reportData}
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Report Type & Filters */}
      <Card>
        <div className="p-4">
          <div className="flex flex-col md:flex-row gap-4 md:items-center justify-between">

            {/* Left: Type Selector */}
            <div className="flex items-center gap-4">
              <div className="flex bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setReportType('daily')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${reportType === 'daily'
                    ? 'bg-white text-primary-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  Daily
                </button>
                <button
                  onClick={() => setReportType('monthly')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${reportType === 'monthly'
                    ? 'bg-white text-primary-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  Monthly
                </button>
              </div>
            </div>

            {/* Right: Date & Employee Filters */}
            <div className="flex flex-col md:flex-row gap-4 items-end md:items-center">

              {/* Employee Filter */}
              <div className="relative min-w-[200px]">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Users className="h-4 w-4 text-gray-400" />
                </div>
                <select
                  value={selectedEmployee}
                  onChange={(e) => setSelectedEmployee(e.target.value)}
                  className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none bg-white"
                >
                  <option value="">All Employees</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                  ))}
                </select>
              </div>

              {/* Date/Month Filter */}
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                {reportType === 'daily' ? (
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                ) : (
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Summary Stats */}
      {reportData?.summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 border-l-4 border-primary-500 dark:border-primary-400">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {reportType === 'daily'
                  ? reportData.summary.totalEmployees || reportData.summary.totalWorkingDays || '-'
                  : reportData.summary.totalWorkingDays || '-'}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {selectedEmployee
                  ? (reportType === 'daily' ? 'Active' : 'Working Days')
                  : (reportType === 'daily' ? 'Total Employees' : 'Working Days')}
              </p>
            </div>
          </Card>

          <Card className="p-4 border-l-4 border-emerald-500">
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {reportData.summary.present || reportData.summary.presentDays || 0}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Present</p>
            </div>
          </Card>

          <Card className="p-4 border-l-4 border-amber-500">
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {reportData.summary.late || reportData.summary.lateDays || 0}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Late</p>
            </div>
          </Card>

          <Card className="p-4 border-l-4 border-red-500">
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {reportData.summary.absent || reportData.summary.absentDays || 0}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Absent</p>
            </div>
          </Card>

          {/* Payroll Card (Only when single employee selected) */}
          {reportData.summary.estimatedSalary !== undefined && (
            <Card className="p-4 border-l-4 border-blue-500 md:col-span-4 lg:col-span-1">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  Rp {reportData.summary.estimatedSalary.toLocaleString('id-ID')}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Estimasi Gaji</p>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <Card>
          <div className="p-12 text-center">
            <div className="animate-pulse text-gray-400">Loading report...</div>
          </div>
        </Card>
      )}

      {/* Report Details */}
      {!loading && reportData && (
        <Card>
          <Card.Header>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">
                {selectedEmployee
                  ? `Performance Report: ${employees.find(e => e.id === parseInt(selectedEmployee))?.fullName || 'Employee'}`
                  : (reportType === 'daily' ? 'Daily Attendance Details' : 'Monthly Attendance Details')}
              </h3>
            </div>
          </Card.Header>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Clock In
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Clock Out
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Hours
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {((reportData.records || []).length > 0) ? (reportData.records || []).map((record, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {/* Debug: check raw date if formatDate fails */}
                      {record.date ? formatDate(record.date) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {record.user?.fullName || '-'}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {record.user?.employeeId || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                      {record.clockIn ? (record.clockIn.includes('T') ? new Date(record.clockIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : record.clockIn) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                      {record.clockOut ? (record.clockOut.includes('T') ? new Date(record.clockOut).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : record.clockOut) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                        ${record.status === 'PRESENT' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : ''}
                        ${record.status === 'LATE' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' : ''}
                        ${record.status === 'ABSENT' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : ''}
                        ${record.status === 'HALF_DAY' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' : ''}
                      `}>
                        {/* Fix status display */}
                        {(record.status || '').toLowerCase().replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                      {/* Fix Zero Hours display */}
                      {record.totalHours !== undefined && record.totalHours !== null ? record.totalHours : '-'}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="6" className="text-center py-12 text-gray-500">
                      No records found for this period
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ReportsPage;
