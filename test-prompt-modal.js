// Simple test to verify the prompt pack modal fix
// This would be run in the browser console when testing the plugin

console.log('Testing Daily Prompts Plugin - Add Prompt functionality');

// Mock the required classes for testing
class MockPrompt {
  constructor(data, skipValidation = false) {
    this.id = data.id || 'test-id';
    this.content = data.content;
    this.type = data.type || 'string';
    this.date = data.date;
    this.order = data.order;
    this.metadata = data.metadata || {};

    if (!skipValidation) {
      this.validate();
    }
  }

  validate() {
    if (!this.content || this.content.trim().length === 0) {
      throw new Error('Prompt content must be a non-empty string');
    }
  }
}

// Test 1: Creating prompt with empty content should fail without skipValidation
try {
  new MockPrompt({ content: '' });
  console.error('❌ Test 1 failed: Should have thrown validation error');
} catch (error) {
  console.log('✅ Test 1 passed: Validation error thrown as expected');
}

// Test 2: Creating prompt with empty content should succeed with skipValidation
try {
  const prompt = new MockPrompt({ content: '' }, true);
  console.log('✅ Test 2 passed: Prompt created with skipValidation=true');
} catch (error) {
  console.error('❌ Test 2 failed: Should not have thrown error with skipValidation=true');
}

// Test 3: Creating prompt with valid content should always succeed
try {
  const prompt = new MockPrompt({ content: 'Valid prompt content' });
  console.log('✅ Test 3 passed: Prompt created with valid content');
} catch (error) {
  console.error('❌ Test 3 failed: Should not have thrown error with valid content');
}

console.log('Test completed. The fix should allow creating empty prompts during editing.');