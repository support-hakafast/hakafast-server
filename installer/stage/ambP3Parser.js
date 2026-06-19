/**
 * MYLAPS / AMB P3 protocol parser (TranX 160, TranX3, RC4, etc.)
 * Ported from datagutten/amb-p3-parser (GPL-2.0) message layout.
 */

const SOM = 0x8e;
const EOM = 0x8f;
const ESC = 0x8d;

const RECORD_TYPES = {
  0x00: 'RESET',
  0x01: 'PASSING',
  0x02: 'STATUS',
  0x45: 'FIRST_CONTACT',
  0xffff: 'ERROR',
};

const PASSING_FIELDS = {
  0x01: 'PASSING_NUMBER',
  0x03: 'TRANSPONDER',
  0x04: 'RTC_TIME',
  0x05: 'STRENGTH',
  0x06: 'HITS',
  0x08: 'FLAGS',
};

const GENERAL_FIELDS = {
  0x81: 'DECODER_ID',
  0x83: 'CONTROLLER_ID',
  0x85: 'REQUEST_ID',
};

function formatValue(buffer, offset, length, reverse = true) {
  const slice = buffer.subarray(offset, offset + length);
  const bytes = reverse ? Buffer.from(slice).reverse() : slice;
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return parseInt(hex, 16);
}

function unescapeRecord(buffer) {
  const out = [];
  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer[i] === ESC && i + 1 < buffer.length) {
      out.push(buffer[i + 1] - 0x20);
      i += 1;
    } else {
      out.push(buffer[i]);
    }
  }
  return Buffer.from(out);
}

function readFields(buffer, fieldMap) {
  const messages = {};
  let pos = 0x0a;
  while (pos < buffer.length - 1) {
    const fieldId = buffer[pos];
    const fieldName = fieldMap[fieldId];
    if (!fieldName) {
      throw new Error(`Unknown P3 field 0x${fieldId.toString(16)} at offset ${pos}`);
    }
    const length = buffer[pos + 1];
    messages[fieldName] = formatValue(buffer, pos + 2, length);
    pos += length + 2;
  }
  return messages;
}

function parseHeader(buffer) {
  return {
    version: buffer[0x01],
    length: formatValue(buffer, 0x02, 2),
    crc: formatValue(buffer, 0x04, 2, true),
    flags_header: formatValue(buffer, 0x06, 2, true),
    type: formatValue(buffer, 0x08, 2),
  };
}

function parseRecord(rawBuffer) {
  if (!rawBuffer || rawBuffer.length < 12) {
    throw new Error('Invalid P3 record (too short)');
  }
  const buffer = unescapeRecord(rawBuffer);
  if (buffer[0] !== SOM || buffer[buffer.length - 1] !== EOM) {
    throw new Error('Invalid P3 record framing');
  }

  const header = parseHeader(buffer);
  const typeName = RECORD_TYPES[header.type];
  if (!typeName) {
    throw new Error(`Unknown P3 record type 0x${header.type.toString(16)}`);
  }

  let body = {};
  if (header.type === 0x01) {
    body = readFields(buffer, { ...PASSING_FIELDS, ...GENERAL_FIELDS });
  } else if (header.type === 0x02) {
    return { ...header, typeName, raw: buffer };
  } else {
    return { ...header, typeName, raw: buffer };
  }

  if (header.length !== buffer.length) {
    throw new Error(`P3 length mismatch (declared ${header.length}, actual ${buffer.length})`);
  }

  return { ...header, typeName, ...body };
}

function extractRecords(chunk) {
  const records = [];
  let start = -1;
  for (let i = 0; i < chunk.length; i += 1) {
    if (chunk[i] === SOM) start = i;
    if (chunk[i] === EOM && start >= 0) {
      records.push(chunk.subarray(start, i + 1));
      start = -1;
    }
  }
  const remainder = start >= 0 ? chunk.subarray(start) : Buffer.alloc(0);
  return { records, remainder };
}

class AmbP3StreamParser {
  constructor() {
    this.buffer = Buffer.alloc(0);
  }

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const { records, remainder } = extractRecords(this.buffer);
    this.buffer = remainder;
    const parsed = [];
    records.forEach((raw) => {
      try {
        parsed.push(parseRecord(raw));
      } catch (err) {
        parsed.push({ error: err.message, raw });
      }
    });
    return parsed;
  }

  reset() {
    this.buffer = Buffer.alloc(0);
  }
}

module.exports = {
  AmbP3StreamParser,
  parseRecord,
  extractRecords,
  RECORD_TYPES,
};
