export const isValidEmail = (email: string): boolean => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

export const isValidPhone = (phone: string): boolean => {
  const regex = /^(0|62|\+62)8[1-9][0-9]{6,10}$/;
  return regex.test(phone);
};

export const isValidNIK = (nik: string): boolean => {
  return /^[0-9]{16}$/.test(nik);
};
