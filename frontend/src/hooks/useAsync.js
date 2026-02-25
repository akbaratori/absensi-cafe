import { useState, useEffect } from 'react';

/**
 * Hook for async operations with loading and error states
 */
export const useAsync = (asyncFunction, immediate = false) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const execute = async (...args) => {
    setLoading(true);
    setError(null);

    try {
      const response = await asyncFunction(...args);
      setData(response);
      return response;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [immediate]);

  return { data, loading, error, execute };
};

/**
 * Hook for fetching data on mount
 */
export const useFetch = (asyncFunction, dependencies = []) => {
  const { data, loading, error, execute } = useAsync(asyncFunction, true);

  useEffect(() => {
    execute();
  }, dependencies);

  return { data, loading, error, refetch: execute };
};
