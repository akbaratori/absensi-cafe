/**
 * Script untuk mengecek dan memperbaiki role admin
 *
 * Cara menjalankan:
 * 1. npx prisma db push  (pastikan schema terupdate)
 * 2. node scripts/check-admin-role.js
 */

const { PrismaClient } = require('@prisma/client');
const readline = require('readline');

const prisma = new PrismaClient();
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('\n=== CEK ROLE ADMIN DI DATABASE ===\n');

  try {
    // 1. Tampilkan semua user
    console.log('Daftar semua user:');
    console.log('─'.repeat(80));
    console.log(sprintf('%-5s %-15s %-20s %-15s %-10s', 'ID', 'Username', 'Full Name', 'Role', 'Active'));
    console.log('─'.repeat(80));

    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        isActive: true,
      },
      orderBy: { id: 'asc' }
    });

    users.forEach(user => {
      console.log(sprintf(
        '%-5d %-15s %-20s %-15s %-10s',
        user.id,
        user.username,
        user.fullName,
        user.role,
        user.isActive ? '✓' : '✗'
      ));
    });

    console.log('─'.repeat(80));
    console.log(`Total user: ${users.length}\n`);

    // 2. Cek user dengan role ADMIN
    const admins = users.filter(u => u.role === 'ADMIN' && u.isActive);
    console.log(`User dengan role ADMIN: ${admins.length}\n`);

    if (admins.length > 0) {
      console.log('✓ Admin sudah ada:');
      admins.forEach(admin => {
        console.log(`  - ${admin.username} (${admin.fullName})`);
      });
      console.log('\nJika Anda tetap tidak bisa mengakses halaman admin/off-days,');
      console.log('maka masalahnya bukan di role database, tapi di:');
      console.log('  1. Token JWT yang expired (coba logout lalu login lagi)');
      console.log('  2. Cache browser (clear browser cache dan localStorage)');
      console.log('  3. Backend tidak terbaca dengan benar');
    } else {
      console.log('✗ TIDAK ADA user dengan role ADMIN yang aktif!');
      console.log('\nIngin mengubah role user menjadi ADMIN?');

      const answer = await question('\nMasukkan username yang ingin dijadikan ADMIN (atau tekan ENTER untuk keluar): ');

      if (answer.trim()) {
        const username = answer.trim();
        const targetUser = users.find(u => u.username.toLowerCase() === username.toLowerCase());

        if (!targetUser) {
          console.log(`\n✗ Error: User "${username}" tidak ditemukan!`);
        } else {
          console.log(`\nUser ditemukan: ${targetUser.fullName} (${targetUser.role})`);

          const confirm = await question(`Ubah role "${username}" menjadi ADMIN? (ya/tidak): `);

          if (confirm.toLowerCase() === 'ya' || confirm.toLowerCase() === 'y') {
            // Update user role
            await prisma.user.update({
              where: { id: targetUser.id },
              data: { role: 'ADMIN' }
            });

            console.log(`\n✓ SUCCESS: User "${username}" sekarang memiliki role ADMIN`);
            console.log('\nSILAKAN LOGOUT LALU LOGIN KEMBALI untuk update token!');
          } else {
            console.log('\nDibatalkan.');
          }
        }
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
    rl.close();
  }

  console.log('\n=== SELESAI ===\n');
}

// Helper function for string formatting
function sprintf(format, ...args) {
  let i = 0;
  return format.replace(/%[-+0-9]*[sd]/g, (match) => {
    const value = args[i++];
    return match.includes('d') ? parseInt(value) || 0 : String(value);
  });
}

main();
