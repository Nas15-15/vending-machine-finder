#!/usr/bin/env node
/**
 * Utility script to generate bcrypt password hash for owner login
 * Usage: node scripts/generate-password-hash.js <password>
 */

import bcrypt from 'bcryptjs';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function generateHash(password) {
  return bcrypt.hash(password, 10);
}

const password = process.argv[2];

if (password) {
  // Password provided as argument
  generateHash(password).then(hash => {
    console.log('\n✅ Password hash generated:');
    console.log(hash);
    console.log('\nAdd this to your .env file as:');
    console.log(`OWNER_PASSWORD_HASH=${hash}\n`);
    process.exit(0);
  }).catch(error => {
    console.error('Error generating hash:', error);
    process.exit(1);
  });
} else {
  // Prompt for password
  rl.question('Enter password to hash: ', (password) => {
    if (!password) {
      console.error('Password cannot be empty');
      rl.close();
      process.exit(1);
    }
    
    generateHash(password).then(hash => {
      console.log('\n✅ Password hash generated:');
      console.log(hash);
      console.log('\nAdd this to your .env file as:');
      console.log(`OWNER_PASSWORD_HASH=${hash}\n`);
      rl.close();
      process.exit(0);
    }).catch(error => {
      console.error('Error generating hash:', error);
      rl.close();
      process.exit(1);
    });
  });
}












