const express = require('express')
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors =require('cors')
const app = express();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require('dotenv').config()
const port =process.env.PORT || 3000
const JWT_SECRET = process.env.JWT_SECRET

// middleware 
app.use(express.json());
app.use(cors())

const uri = `mongodb+srv://${process.env.MANAGEMENT_DB}:${process.env.MANAGEMENT_PASSWORD}@cluster0.ri8wtve.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// verifytoken 
const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if(!authHeader) return res.status(401).json({ message: "No token" });
    const token = authHeader.split(" ")[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch(err) {
        res.status(401).json({ message: "Invalid token" });
    }
};

const verifyHR = (req,res,next)=>{
    if(req.user.role !== "hr") return res.status(403).json({ message:"Not allowed" });
    next();
};

let db, users, assets, requests, assignedAssets, packages, payments, employeeAffiliations;
async function connectDB() {
  try {
    await client.connect();
    db = client.db("assetverse");

    // collection 
    users = db.collection("users");
    assets = db.collection("assets");
    requests = db.collection("requests");
    assignedAssets = db.collection("assignedAssets");
    packages = db.collection("packages");
    payments = db.collection("payments");
    employeeAffiliations = db.collection("employeeAffiliations");
    console.log("MongoDB Connected");
  } catch (err) {
    console.error(err);
  }
}
connectDB();

// login 
app.post("/api/auth/firebase-login", async (req,res)=>{
    const { email } = req.body;
    const user = await users.findOne({ email });
    if(!user) return res.status(404).json({ message:"User not found" });
    const token = jwt.sign({ email:user.email, role:user.role }, JWT_SECRET, { expiresIn:"7d" });
    res.json({ token });
});

// register hr 
app.post("/api/users/register/hr", async (req,res)=>{
    const { name, email, password, companyName, companyLogo, dateOfBirth } = req.body;
    const existing = await users.findOne({ email });
    if(existing) return res.status(400).json({ message:"Email exists" });
    const hashed = await bcrypt.hash(password, 10);
    const newHR = { name,email,password:hashed,companyName,companyLogo,role:"hr",packageLimit:5,currentEmployees:0,subscription:"basic",dateOfBirth,createdAt:new Date(),updatedAt:new Date() };
    await users.insertOne(newHR);
    res.json({ message:"HR registered" });
});

// register emploee 

app.post("/api/users/register/employee", async (req,res)=>{
    const { name,email,password,dateOfBirth } = req.body;
    const existing = await users.findOne({ email });
    if(existing) return res.status(400).json({ message:"Email exists" });
    const hashed = await bcrypt.hash(password,10);
    const newEmp = { name,email,password:hashed,role:"employee",dateOfBirth,createdAt:new Date(),updatedAt:new Date() };
    await users.insertOne(newEmp);
    res.json({ message:"Employee registered" });
});

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
