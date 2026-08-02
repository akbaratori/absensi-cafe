import { FileText } from 'lucide-react';

const AIReportPage = () => {
  return (
    <div className="p-6 max-w-7xl mx-auto text-center">
      <div className="mb-6">
        <div className="flex items-center justify-center gap-3 mb-4">
          <FileText className="text-gray-400" size={48} />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Generate Laporan AI</h1>
        <p className="text-gray-600">
          Fitur ini sedang dinonaktifkan sementara untuk pemeliharaan.
        </p>
      </div>
    </div>
  );
};

export default AIReportPage;
