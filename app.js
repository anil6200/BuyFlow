
// Load environment variables
require("dotenv").config({ path: "./.env" });

// Import dependencies
const express = require('express');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const cors = require("cors");
const helmet = require("helmet");
const passport = require("passport");
const session = require("express-session");
const MongoStore=require("connect-mongo")




// Import routes
const usersRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");
const productRoutes = require("./routes/productRoutes");
const cartRoutes = require("./routes/cartRoutes");
const wishlistRoutes = require("./routes/wishlistRoutes");
const orderRoutes = require("./routes/orderRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");


// Database connection
require("./config/db.config").DbConnection();

// Initialize Express app
const app = express();

// Middleware setup
app.use(cors()); // Enable CORS for API access
app.use(logger('tiny')); // Logger middleware
app.use(helmet()); // Secure HTTP headers
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(cookieParser()); // Cookie parser


// Session setup (required for passport)
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store:MongoStore.create({mongoUrl:process.env.MONGO_URL})
}));

// Initialize Passport for authentication
app.use(passport.initialize());
app.use(passport.session());


// Set up route prefixes
app.get("/Ecommerce",  (req, res) => {
    res.send("Welcome to the API")
})
app.use(`/Ecommerce/users/user`, usersRoutes);
app.use("/Ecommerce/admins/admin", adminRoutes);
app.use('/Ecommerce/products', productRoutes);
app.use('/Ecommerce/users/user/cart', cartRoutes);
app.use("/Ecommerce/user/wishlist", wishlistRoutes);
app.use("/Ecommerce/order", orderRoutes);
app.use("/Ecommerce/dashboard", dashboardRoutes);



// Catch-all route for unknown paths
app.all('*', (req, res) => {
    res.status(404).json({ success: false, message: `${req.url} not found` });
});

// Start server
const PORT = process.env.PORT || 8080; 
app.listen(PORT, () => {
    console.log(`Server started running on port ${PORT}`);
});

app.get("/", (req, res) => {
    res.send("BuyFlow backend is running 🚀");
  });
  