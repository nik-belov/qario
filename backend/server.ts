import { app } from './src/routes/index'; // Use named import

// Create Express app
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
