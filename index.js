const express = require('express')
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors =require('cors')
const app = express();
require('dotenv').config()
const port =process.env.PORT || 3000

// middleware 
app.use(express.json());
app.use(cors())

// ZOPEW8wI8GrK91MJ 

const uri = `mongodb+srv://${process.env.MANAGEMENT_DB}:${process.env.MANAGEMENT_PASSWORD}@cluster0.ri8wtve.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
let db;
async function connectDB() {
  try {
    await client.connect();
    db = client.db("assetverse");
    console.log("MongoDB Connected");
  } catch (err) {
    console.error(err);
  }
}
connectDB();


app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
