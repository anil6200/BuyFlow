const express = require('express');
const router = express.Router();
const { totalProducts, singleProduct, updateProduct, deleteProduct, deleteImageFromCloudinary,productByCategory, searchProducts, sortProducts,addReview, getProductReviews, addProduct } = require('../controllers/product.controllers');
const { AdminIsLoggedIn, UserIsLoggedIn } = require('../middlewares/auth.middleware');
const upload = require("../utils/multer");

// /add 
// tested 
router.post('/add', [AdminIsLoggedIn, upload.array('images', 5)],  addProduct);

// /all
// tested
router.get("/all", totalProducts);

// /product/:id
// tested
router.get("/product/:id", singleProduct);

// /product/update/:id
router.put("/product/update", [AdminIsLoggedIn, upload.array('images', 5)],  updateProduct);

// /product/delete/:id
// tested
router.delete("/product/delete",AdminIsLoggedIn, deleteProduct);
router.delete('/deleteimage',AdminIsLoggedIn,deleteImageFromCloudinary)

///category
// tested
router.get("/category",  productByCategory);

// /searchproducts
// tested
router.get("/searchproducts", searchProducts);

//sort products
// tested
router.get("/sortproducts",  sortProducts);

// /add/review
// tested
router.post("/add/review", UserIsLoggedIn, addReview);

// /product/:productId/reviews
// tested
router.get('/product/:productId/reviews', UserIsLoggedIn, getProductReviews);




module.exports = router;