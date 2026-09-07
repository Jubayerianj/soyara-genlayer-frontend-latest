// components/utils/bigintHelpers.js
/**
 * Recursively converts all BigInt values in an object, array,
 * or primitive into strings.
 *
 * Safe for:
 * - JSON.stringify
 * - Debug logging
 * - Next.js SSR / RSC
 *
 * @param {*} value
 * @returns {*}
 */
export function convertBigIntsToStrings(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(convertBigIntsToStrings);
  }

  if (typeof value === 'object') {
    const result = {};
    for (const key in value) {
      // Protect against prototype pollution
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        result[key] = convertBigIntsToStrings(value[key]);
      }
    }
    return result;
  }

  return value;
}

/**
 * Safely JSON.stringify values containing BigInt
 * without throwing "Do not know how to serialize a BigInt".
 *
 * @param {*} value
 * @param {number} space
 * @returns {string}
 */
export function stringifyWithBigInt(value, space = 2) {
  return JSON.stringify(convertBigIntsToStrings(value), null, space);
}

/**
 * Checks whether a value (deeply) contains any BigInt.
 *
 * @param {*} value
 * @returns {boolean}
 */
export function hasBigInt(value) {
  if (typeof value === 'bigint') return true;

  if (Array.isArray(value)) {
    return value.some(hasBigInt);
  }

  if (value && typeof value === 'object') {
    return Object.values(value).some(hasBigInt);
  }

  return false;
}
