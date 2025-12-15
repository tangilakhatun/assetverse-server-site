const express = require('express')
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors =require('cors')
const app = express();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const stripe = require("stripe");
require('dotenv').config()
const port =process.env.PORT || 3000
const JWT_SECRET = process.env.JWT_SECRET
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const stripeInstance = stripe(STRIPE_KEY);

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


// user profil
app.get("/api/users/me", verifyToken, async (req, res) => {
    const user = await users.findOne({ email: req.user.email });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
});

// update profile 

app.put("/api/users/me", verifyToken, async (req,res)=>{
    const update = { ...req.body, updatedAt:new Date() };
    await users.updateOne({ email:req.user.email }, { $set:update });
    res.json({ message:"Updated" });
});

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

             //  assets crud operations

//  Get all assets 
app.get("/api/assets", verifyToken, async (req,res)=>{
    const data = await assets.find({}).toArray();
    res.json(data);
});

// Add Asset (HR)
app.post("/api/assets", verifyToken, verifyHR, async (req,res)=>{
    const { productName, productImage, productType, productQuantity } = req.body;
    const asset = { productName, productImage, productType, productQuantity, availableQuantity:productQuantity, dateAdded:new Date(), hrEmail:req.user.email, companyName:req.user.companyName };
    await assets.insertOne(asset);
    res.json({ message:"Asset added" });
});

// Update Asset (HR)
app.put("/api/assets/:id", verifyToken, verifyHR, async (req,res)=>{
    const { id } = req.params;
    await assets.updateOne({ _id:ObjectId(id) }, { $set:req.body });
    res.json({ message:"Asset updated" });
});

// Delete Asset
app.delete("/api/assets/:id", verifyToken, verifyHR, async (req,res)=>{
    const { id } = req.params;
    await assets.deleteOne({ _id:ObjectId(id) });
    res.json({ message:"Asset deleted" });
});

            // end assets crud operations 

            // requests api start
            
// employee requests asset
app.post("/api/requests", verifyToken, async (req,res)=>{
    const { assetId,note } = req.body;
    const asset = await assets.findOne({ _id:ObjectId(assetId) });
    if(!asset || asset.availableQuantity < 1) return res.status(400).json({ message:"Not available" });

    // create request
    const reqDoc = { assetId:ObjectId(assetId), assetName:asset.productName, assetType:asset.productType, requesterName:req.user.name, requesterEmail:req.user.email, hrEmail:asset.hrEmail, companyName:asset.companyName, requestDate:new Date(), approvalDate:null, requestStatus:"pending", note };
    await requests.insertOne(reqDoc);
    res.json({ message:"Request created" });
});

// hr approves request
app.put("/api/requests/:id/approve", verifyToken, verifyHR, async (req,res)=>{
    const { id } = req.params;
    const reqDoc = await requests.findOne({ _id:ObjectId(id) });
    if(!reqDoc) return res.status(404).json({ message:"Not found" });

    // check package limit
    const hr = await users.findOne({ email:req.user.email });
    const activeAffiliations = await employeeAffiliations.countDocuments({ hrEmail:req.user.email,status:"active" });
    if(activeAffiliations >= hr.packageLimit) return res.status(400).json({ message:"Package limit reached" });
// approve request
    await requests.updateOne({ _id:ObjectId(id) }, { $set:{ requestStatus:"approved", approvalDate:new Date(), processedBy:req.user.email } });

    // deduct available quantity
    await assets.updateOne({ _id:reqDoc.assetId }, { $inc:{ availableQuantity:-1 } });

    // assign asset
    const assign = { assetId:reqDoc.assetId, assetName:reqDoc.assetName, assetImage:reqDoc.assetImage || "", assetType:reqDoc.assetType, employeeEmail:reqDoc.requesterEmail, employeeName:reqDoc.requesterName, hrEmail:reqDoc.hrEmail, companyName:reqDoc.companyName, assignmentDate:new Date(), returnDate:null, status:"assigned" };
    await assignedAssets.insertOne(assign);

    // create affiliation if first request
    const exists = await employeeAffiliations.findOne({ employeeEmail:reqDoc.requesterEmail, hrEmail:req.user.email });
    if(!exists) await employeeAffiliations.insertOne({ employeeEmail:reqDoc.requesterEmail, employeeName:reqDoc.requesterName, hrEmail:req.user.email, companyName:req.user.companyName, companyLogo:req.user.companyLogo, affiliationDate:new Date(), status:"active" });

    res.json({ message:"Request approved" });
});

// hr rejects request
app.put("/api/requests/:id/reject", verifyToken, verifyHR, async (req,res)=>{
    const { id } = req.params;
    await requests.updateOne({ _id:ObjectId(id) }, { $set:{ requestStatus:"rejected", approvalDate:new Date(), processedBy:req.user.email } });
    res.json({ message:"Request rejected" });
});

// get all requests (hr)
app.get("/api/requests", verifyToken, verifyHR, async (req,res)=>{
    const data = await requests.find({ hrEmail:req.user.email }).toArray();
    res.json(data);
});

                 // request api end 
      //  assigned assets 

      app.get("/api/assigned/my-assets", verifyToken, async (req,res)=>{
    const data = await assignedAssets.find({ employeeEmail:req.user.email }).toArray();
    res.json(data);
});

// Return asset
app.put("/api/assigned/:id/return", verifyToken, async (req,res)=>{
    const { id } = req.params;
    const doc = await assignedAssets.findOne({ _id:ObjectId(id) });
    if(!doc) return res.status(404).json({ message:"Not found" });
    if(doc.status === "returned") return res.status(400).json({ message:"Already returned" });

    await assignedAssets.updateOne({ _id:ObjectId(id) }, { $set:{ status:"returned", returnDate:new Date() } });
    await assets.updateOne({ _id:doc.assetId }, { $inc:{ availableQuantity:1 } });
    res.json({ message:"Asset returned" });
});

// employees list 
   app.get("/api/employees", verifyToken, verifyHR, async (req,res)=>{
    const data = await employeeAffiliations.find({ hrEmail:req.user.email }).toArray();
    res.json(data);
});

// Remove Employee
app.delete("/api/employees/:email", verifyToken, verifyHR, async (req,res)=>{
    const { email } = req.params;
    await employeeAffiliations.updateMany({ employeeEmail:email, hrEmail:req.user.email }, { $set:{ status:"inactive" } });
    await assignedAssets.updateMany({ employeeEmail:email, hrEmail:req.user.email, status:"assigned" }, { $set:{ status:"returned", returnDate:new Date() } });
    res.json({ message:"Employee removed" });
});
    // packages 


// Get packages
app.get("/api/packages", async (req,res)=>{
    const data = await packages.find({}).toArray();
    res.json(data);
});
// GET employee/my-team
app.get("/api/employee/my-team", verifyToken, async (req, res) => {
  try {
    
    const data = await employeeAffiliations
      .find({ employeeEmail: req.user.email, status: "active" })
      .toArray();

    res.json(data);
  } catch (err) {
    console.error("Error fetching employee team:", err);
    res.status(500).json({ message: "Failed to load team", error: err.message });
  }
});

// Upgrade package (Stripe)
app.post("/api/packages/upgrade", verifyToken, verifyHR, async (req,res)=>{
    const { packageName, employeeLimit, amount, transactionId } = req.body;
    await users.updateOne({ email:req.user.email }, { $set:{ packageLimit:employeeLimit, subscription:packageName, updatedAt:new Date() } });
    await payments.insertOne({ hrEmail:req.user.email, packageName, employeeLimit, amount, transactionId, paymentDate:new Date(), status:"completed" });
    res.json({ message:"Package upgraded" });
});

 // Top 5 requested assets
app.get("/api/assets/top-requested", verifyToken, verifyHR, async (req,res)=>{
    try{
        // Group requests by assetName and count
        const pipeline = [
            { $match: { hrEmail: req.user.email } }, // only this HR's requests
            { $group: { _id: "$assetName", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ];
        const topAssets = await requests.aggregate(pipeline).toArray();
        res.json(topAssets.map(a => ({ name: a._id, requests: a.count })));
    } catch(err) {
        res.status(500).json({ message:"Server error", error: err.message });
    }
});

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
