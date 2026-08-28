require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.users.findMany({
  select:{id:true,username:true,password_hash:true,role:true,is_active:true,telegram_user_id:true},
  take:10
}).then(u=>{
  u.forEach(x=>console.log(x.id,'|',x.username,'|',x.role,'|',x.is_active,'|',x.telegram_user_id,'|',x.password_hash.substring(0,40)));
  p.$disconnect();
}).catch(e=>{console.log('ERR:',e.message);p.$disconnect();});
