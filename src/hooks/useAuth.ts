import { useAuth as contextAuth } from '../context/AuthContext';

export const useAuth = () => {
  return contextAuth();
};

export default useAuth;
