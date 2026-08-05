import PublicScheduleWidget from '../../components/shared/PublicScheduleWidget';


const PublicSchedulePage = () => {
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
            <h1 className="text-xl font-bold text-center mb-4 text-gray-800 dark:text-white">Jadwal Publik</h1>
            <PublicScheduleWidget />
        </div>
    );
};

export default PublicSchedulePage;
