import react from '@vitejs/plugin-react';

export default {
  plugins: [react()],
  server: { port: 5186, host: true, strictPort: true },
};
