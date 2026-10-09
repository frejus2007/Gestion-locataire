export const useAuthModule = () => {
  const useFb = import.meta.env.VITE_USE_FIREBASE === "true";
  if (useFb) {
    return import("../context/AuthContext.firebase.jsx");
  }
  return import("../context/AuthContext.jsx");
};
