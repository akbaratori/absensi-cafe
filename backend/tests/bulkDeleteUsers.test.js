// Repository & audit di-mock: test fokus ke alur keputusan service, bukan ke DB.
jest.mock('../src/repositories/userRepository', () => ({
  findManyByIds: jest.fn(),
  deleteManyByIds: jest.fn(),
  delete: jest.fn(),
  countByRole: jest.fn(),
}));

jest.mock('../src/services/auditService', () => ({
  logUserChange: jest.fn().mockResolvedValue(undefined),
}));

const adminService = require('../src/services/adminService');
const userRepository = require('../src/repositories/userRepository');
const auditService = require('../src/services/auditService');
const { bulkDeleteUsersSchema } = require('../src/utils/validator');

/**
 * Hapus pengguna massal (admin).
 *
 * Yang dijaga di sini adalah aturan pengamanannya, bukan query Prisma-nya:
 *  - admin tidak boleh ikut menghapus akunnya sendiri (bisa mengunci diri);
 *  - permintaan kosong ditolak, bukan "sukses 0" yang menyembunyikan bug UI;
 *  - validasi body menolak daftar kosong / id duplikat / lebih dari 100 id.
 *
 * Test ini TIDAK menyentuh database: dua pengaman pertama diperiksa sebelum
 * service melakukan query apa pun, jadi tidak perlu user asli di DB.
 */
describe('bulkDeleteUsers — pengaman aksi massal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('menolak hapus akun sendiri (id admin ada di daftar)', async () => {
    await expect(adminService.bulkDeleteUsers([7, 8], 7))
      .rejects.toMatchObject({ code: 'CANNOT_DELETE_SELF', statusCode: 400 });
  });

  it('menolak akun sendiri walau ditulis sebagai string (id dari token)', async () => {
    await expect(adminService.bulkDeleteUsers(['12', '13'], '12'))
      .rejects.toMatchObject({ code: 'CANNOT_DELETE_SELF' });
  });

  it('menolak daftar kosong', async () => {
    await expect(adminService.bulkDeleteUsers([], 1))
      .rejects.toMatchObject({ code: 'NO_USERS_SELECTED', statusCode: 400 });
  });

  it('id duplikat dianggap satu, jadi 2x id sendiri tetap ditolak', async () => {
    // Setelah dideduplikasi tinggal [5], dan 5 adalah admin yang meminta.
    await expect(adminService.bulkDeleteUsers([5, 5], 5))
      .rejects.toMatchObject({ code: 'CANNOT_DELETE_SELF' });
  });

  it('id yang bukan angka dibuang, bukan diteruskan ke query', async () => {
    // 'abc' tidak jadi id; setelah disaring daftarnya kosong -> ditolak.
    await expect(adminService.bulkDeleteUsers(['abc', null], 1))
      .rejects.toMatchObject({ code: 'NO_USERS_SELECTED' });
  });
});

describe('bulkDeleteUsers — alur hapus (repository di-mock)', () => {
  const EMPLOYEES = [
    { id: 11, username: 'budi', fullName: 'Budi', role: 'EMPLOYEE' },
    { id: 12, username: 'sari', fullName: 'Sari', role: 'EMPLOYEE' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    userRepository.deleteManyByIds.mockResolvedValue({ count: 2 });
  });

  it('hapus 2 pengguna sekali perintah + 1 audit log berisi daftarnya', async () => {
    userRepository.findManyByIds.mockResolvedValue(EMPLOYEES);

    const result = await adminService.bulkDeleteUsers([11, 12], 1);

    expect(userRepository.deleteManyByIds).toHaveBeenCalledWith([11, 12]);
    expect(userRepository.delete).not.toHaveBeenCalled();
    expect(result).toMatchObject({ requestedCount: 2, deletedCount: 2, failed: [] });
    expect(result.deleted.map((u) => u.username)).toEqual(['budi', 'sari']);

    expect(auditService.logUserChange).toHaveBeenCalledTimes(1);
    const [adminId, action, entityId, details] = auditService.logUserChange.mock.calls[0];
    expect(adminId).toBe(1);
    expect(action).toBe('BULK_DELETE');
    expect(entityId).toBe('11,12');
    expect(details.deletedCount).toBe(2);
  });

  it('id yang sudah tidak ada di DB dilewati, bukan menggagalkan seluruh aksi', async () => {
    userRepository.findManyByIds.mockResolvedValue([EMPLOYEES[0]]);
    userRepository.deleteManyByIds.mockResolvedValue({ count: 1 });

    const result = await adminService.bulkDeleteUsers([11, 999], 1);

    expect(userRepository.deleteManyByIds).toHaveBeenCalledWith([11]);
    expect(result.deletedCount).toBe(1);
    expect(result.skippedIds).toEqual([999]);
  });

  it('kalau satu user ditahan FK, sisanya tetap terhapus dan yang gagal dilaporkan', async () => {
    userRepository.findManyByIds.mockResolvedValue(EMPLOYEES);
    // Tahap 1 gagal seluruhnya (FK), tahap 2: id 11 ditahan, id 12 lolos.
    userRepository.deleteManyByIds.mockRejectedValue(
      Object.assign(new Error('FK constraint'), { code: 'P2003' })
    );
    userRepository.delete
      .mockRejectedValueOnce(Object.assign(new Error('FK constraint'), { code: 'P2003' }))
      .mockResolvedValueOnce(EMPLOYEES[1]);

    const result = await adminService.bulkDeleteUsers([11, 12], 1);

    expect(result.deletedCount).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({ id: 11, username: 'budi' });
    expect(result.failed[0].reason).toMatch(/tidak dapat dihapus/i);
    // Audit hanya mencatat yang benar-benar terhapus.
    expect(auditService.logUserChange.mock.calls[0][3].deletedUsers).toEqual([
      { id: 12, username: 'sari', fullName: 'Sari' },
    ]);
  });

  it('kalau SEMUA user ditahan FK, error diteruskan (bukan sukses 0)', async () => {
    userRepository.findManyByIds.mockResolvedValue(EMPLOYEES);
    userRepository.deleteManyByIds.mockRejectedValue(
      Object.assign(new Error('FK constraint'), { code: 'P2003' })
    );
    userRepository.delete.mockRejectedValue(Object.assign(new Error('FK constraint'), { code: 'P2003' }));

    await expect(adminService.bulkDeleteUsers([11, 12], 1)).rejects.toThrow('FK constraint');
    expect(auditService.logUserChange).not.toHaveBeenCalled();
  });

  it('menolak menghapus admin terakhir', async () => {
    userRepository.findManyByIds.mockResolvedValue([
      { id: 11, username: 'admin2', fullName: 'Admin 2', role: 'ADMIN' },
    ]);
    userRepository.countByRole.mockResolvedValue(1);

    await expect(adminService.bulkDeleteUsers([11], 1))
      .rejects.toMatchObject({ code: 'CANNOT_DELETE_LAST_ADMIN' });
    expect(userRepository.deleteManyByIds).not.toHaveBeenCalled();
  });

  it('menghapus 1 dari 2 admin tetap boleh', async () => {
    userRepository.findManyByIds.mockResolvedValue([
      { id: 11, username: 'admin2', fullName: 'Admin 2', role: 'ADMIN' },
    ]);
    userRepository.countByRole.mockResolvedValue(2);
    userRepository.deleteManyByIds.mockResolvedValue({ count: 1 });

    const result = await adminService.bulkDeleteUsers([11], 1);

    expect(result.deletedCount).toBe(1);
  });

  it('tidak menulis audit log kalau tidak ada yang terhapus', async () => {
    userRepository.findManyByIds.mockResolvedValue([]);

    const result = await adminService.bulkDeleteUsers([999], 1);

    expect(result.deletedCount).toBe(0);
    expect(result.skippedIds).toEqual([999]);
    expect(userRepository.deleteManyByIds).not.toHaveBeenCalled();
    expect(userRepository.delete).not.toHaveBeenCalled();
    expect(auditService.logUserChange).not.toHaveBeenCalled();
  });
});

describe('bulkDeleteUsersSchema — validasi body', () => {
  it('menerima daftar id yang wajar', () => {
    const { error, value } = bulkDeleteUsersSchema.validate({ ids: [1, 2, 3] });
    expect(error).toBeUndefined();
    expect(value.ids).toEqual([1, 2, 3]);
  });

  it('menolak daftar kosong', () => {
    expect(bulkDeleteUsersSchema.validate({ ids: [] }).error).toBeDefined();
  });

  it('menolak ids yang hilang', () => {
    expect(bulkDeleteUsersSchema.validate({}).error).toBeDefined();
  });

  it('menolak id duplikat', () => {
    const { error } = bulkDeleteUsersSchema.validate({ ids: [1, 1] });
    expect(error).toBeDefined();
    expect(error.message).toMatch(/terduplikat/i);
  });

  it('menolak lebih dari 100 id', () => {
    const ids = Array.from({ length: 101 }, (_, i) => i + 1);
    expect(bulkDeleteUsersSchema.validate({ ids }).error).toBeDefined();
  });

  it('menolak id nol / negatif / pecahan', () => {
    expect(bulkDeleteUsersSchema.validate({ ids: [0] }).error).toBeDefined();
    expect(bulkDeleteUsersSchema.validate({ ids: [-3] }).error).toBeDefined();
    expect(bulkDeleteUsersSchema.validate({ ids: [1.5] }).error).toBeDefined();
  });

  it('field asing di body dibuang, bukan dianggap sebagai admin pemanggil', () => {
    // Tanpa opsi apa pun Joi menolak kunci tak dikenal...
    expect(bulkDeleteUsersSchema.validate({ ids: [4], adminId: 999 }).error).toBeDefined();

    // ...dan pada jalur route (`validate()` memakai stripUnknown) kunci itu
    // dibuang, sehingga `adminId` dari klien tidak pernah sampai ke service —
    // pemanggil tetap diambil dari token.
    const { error, value } = bulkDeleteUsersSchema.validate(
      { ids: [4], adminId: 999 },
      { abortEarly: false, stripUnknown: true, convert: true }
    );
    expect(error).toBeUndefined();
    expect(value).toEqual({ ids: [4] });
  });
});
