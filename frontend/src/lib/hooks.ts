import { useState } from 'react';

export function useActionState(action) {
  const [state, setState] = useState({ status: 'idle', message: '' });

  const execute = async (...args) => {
    setState({ status: 'loading', message: '' });
    try {
      const result = await action(...args);
      setState(result);
    } catch (error) {
      setState({ status: 'error', message: error.message });
    }
  };

  return { execute, state };
}
