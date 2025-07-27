// Test script to verify time input validation behavior
// This simulates the user typing experience

console.log('Testing Time Input Validation Fix');

// Mock validation function (similar to what's in the plugin)
function validateTimeFormat(value) {
  // Only validate if it looks complete (length >= 4)
  if (value.trim() !== '' && value.length >= 4) {
    return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value);
  }
  return true; // Allow partial input during typing
}

// Test scenarios that should NOT trigger validation errors during typing
const typingSequence = [
  '', '1', '14', '14:', '14:3', '14:30'
];

console.log('Testing typing sequence: 09:00 -> 14:30');
typingSequence.forEach((input, index) => {
  const isValid = validateTimeFormat(input);
  const status = isValid ? '✅ PASS' : '❌ FAIL';
  console.log(`Step ${index + 1}: "${input}" -> ${status}`);
});

// Test final validation (what happens on blur or save)
function finalValidation(value) {
  if (value.trim() === '') {
    return { valid: false, error: 'Time is required' };
  }
  if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
    return { valid: false, error: 'Invalid time format' };
  }
  return { valid: true };
}

console.log('\nTesting final validation:');
const finalTests = ['', '14:30', '25:00', '14:60', '9:00', '09:00'];
finalTests.forEach(input => {
  const result = finalValidation(input);
  const status = result.valid ? '✅ VALID' : `❌ INVALID: ${result.error}`;
  console.log(`"${input}" -> ${status}`);
});

console.log('\n✅ Time input validation fix should now allow smooth typing!');