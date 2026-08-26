// Cron job dinonaktifkan — fitur auto clock-out dan absent detection dihapus.
module.exports = async function handler(req, res) {
  return res.status(405).json({ message: 'Cron job ini telah dinonaktifkan.' });
};
