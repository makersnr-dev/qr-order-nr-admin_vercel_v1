import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 4001;

const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const ORDER_BASE = process.env.ORDER_BASE || API_BASE; // QR uses this base

app.use(express.json());
app.use(express.static(path.join(__dirname,'public')));

app.get('/admin-config', (_req,res)=> res.json({ apiBase: API_BASE, orderBase: ORDER_BASE }));

app.get('/login', (_req,res)=> res.sendFile(path.join(__dirname,'public','login.html')));
app.get('/', (_req,res)=> res.sendFile(path.join(__dirname,'public','index.html')));

app.listen(PORT, ()=> console.log('Admin v15.8 on :'+PORT));
