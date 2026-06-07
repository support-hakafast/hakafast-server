/**
 * Verify AMB P3 parser against reference passing record.
 * Run: node scripts/verify-amb-p3.js
 */
const { parseRecord } = require('../ambP3Parser');

const REF = {
  PASSING_NUMBER: 113736,
  TRANSPONDER: 2906141,
  RTC_TIME: 1437769372993000,
  STRENGTH: 106,
  HITS: 50,
  FLAGS: 0,
  DECODER_ID: 135059,
};

function main() {
  const hex = '8e0233009ec700000100010448bc010003041d582c000408e805bfc4a41b050005026a0006023200080200008104930f02008f';
  const buffer = Buffer.from(hex, 'hex');
  const parsed = parseRecord(buffer);

  const checks = [
    ['type PASSING', parsed.typeName === 'PASSING'],
    ['TRANSPONDER', parsed.TRANSPONDER === REF.TRANSPONDER],
    ['PASSING_NUMBER', parsed.PASSING_NUMBER === REF.PASSING_NUMBER],
    ['RTC_TIME', parsed.RTC_TIME === REF.RTC_TIME],
    ['STRENGTH', parsed.STRENGTH === REF.STRENGTH],
    ['HITS', parsed.HITS === REF.HITS],
    ['DECODER_ID', parsed.DECODER_ID === REF.DECODER_ID],
  ];

  console.log('\n=== AMB P3 parser verification ===\n');
  let failed = 0;
  checks.forEach(([label, ok]) => {
    console.log(`${ok ? '✓' : '✗'} ${label}`);
    if (!ok) failed += 1;
  });
  console.log(`\n${checks.length - failed}/${checks.length} passed`);
  process.exit(failed ? 1 : 0);
}

main();
