import 'dotenv/config';
import { startStdioServer } from './server';

startStdioServer().catch(console.error);
