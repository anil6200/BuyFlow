require("dotenv").config();
const productModel = require("../models/product.model");
const Cloudinary = require('../config/cloudinary')
const userModel = require("../models/user.model")
const reviewModel = require("../models/review.model")
const NodeCache = require("node-cache");
const myCache = new NodeCache({ stdTTL: 100, checkperiod: 120 });


const numberWithCommas = (number) => {
  return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
// add products 
exports.addProduct = async (req, res) => {
  try {
    const { name, description, price, category, stock, discount } = req.body;

    // Validate product details
    if (!name || !description || !price || !category || !stock || !discount) {
      return res.status(400).json({ success: false, message: "Please fill in all product details" });
    }

    // Sanitize and validate price
    // let sanitizedPrice = parseFloat(price.replace(/,/g, ''));
    let sanitizedPrice = parseFloat(String(price).replace(/,/g, ''));

    if (isNaN(sanitizedPrice) || sanitizedPrice < 0) {
      return res.status(400).json({ success: false, message: "Price must be a valid number greater than or equal to 0" });
    }

    // Sanitize and validate discount
    let numericDiscount = parseFloat(discount);
    if (isNaN(numericDiscount) || numericDiscount < 0 || numericDiscount > 100) {
      return res.status(400).json({ success: false, message: "Discount must be a number between 0 and 100" });
    }

    // Calculate the final price after discount
    let finalPrice = sanitizedPrice;
    if (numericDiscount > 0) {
      finalPrice = sanitizedPrice - (sanitizedPrice * (numericDiscount / 100));
    }

    // Get Cloudinary image URLs
    if (!req.files) {
      return res.status(400).json({ success: false, message: "please provide images" })
    }
    const images = req.files.map(file => ({
      url: file.path,
      public_id: file.filename
    }));

    // Create a new product in the database
    const newProduct = await productModel.create({
      name,
      description,
      price: sanitizedPrice,
      priceAfterDiscount: finalPrice,
      category,
      stock,
      images,
      discount: numericDiscount,
    });

    // Respond with the created product
    res.status(201).json({
      success: true,
      newProduct,
    });

  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// total products 
exports.totalProducts = async (req, res, next) => {
  try {
    const DEFAULT_PAGE = 1;
    const DEFAULT_LIMIT = 10;
    const MAX_LIMIT = 100; // Set a maximum limit for the number of products per page

    // Destructure and set defaults for query parameters
    const { page = DEFAULT_PAGE, limit = DEFAULT_LIMIT } = req.query;

    // Validate `page` and `limit` as positive integers
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);

    if (isNaN(pageNumber) || pageNumber < 1 || isNaN(limitNumber) || limitNumber < 1 || limitNumber > MAX_LIMIT) {
      return res.status(400).json({
        success: false,
        message: 'Page and limit must be positive integers, and limit must not exceed ' + MAX_LIMIT + '.',
      });
    }

    // Create a cache key based on page and limit
    const cacheKey = `products_page_${pageNumber}_limit_${limitNumber}`;

    // Check if data exists in the cache
    const cachedData = myCache.get(cacheKey);
    if (cachedData) {
      return res.status(200).json(cachedData); // Return cached response
    }

    // Calculate the number of documents to skip
    const skip = (pageNumber - 1) * limitNumber;

    // Use a single aggregation pipeline for efficient data retrieval and handling
    const [productsData] = await productModel.aggregate([
      {
        $facet: {
          // Get products with pagination and required fields only
          products: [
            { $sort: { createdAt: -1 } }, // Sort by latest products
            { $skip: skip }, // Skip products for pagination
            { $limit: limitNumber }, // Limit the number of returned products
            {
              $project: { // Return only necessary fields to minimize data transfer
                name: 1,
                price: 1,
                images: 1,
                category: 1,
                discount: 1,
                priceAfterDiscount: 1,
                createdAt: 1,
              },
            },
          ],
          // Get the total count of products for pagination calculation
          totalCount: [
            { $count: 'total' },
          ],
        },
      },
    ]);

    // Extract products and total count from the aggregation result
    const products = productsData.products || [];
    const totalProducts = productsData.totalCount[0]?.total || 0;

    // Calculate total number of pages
    const totalPages = Math.ceil(totalProducts / limitNumber);

    // If no products are found, send a 404 response
    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No products found.',
      });
    }

    // Prepare the response object
    const response = {
      success: true,
      products,
      pagination: {
        totalProducts,
        totalPages,
        currentPage: pageNumber,
        itemsPerPage: limitNumber,
      },
    };

    // Store the response in the cache
    myCache.set(cacheKey, response);

    // Send response with products and pagination details
    res.status(200).json(response);
  } catch (error) {
    // Log the error and return a server error response
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching products.',
      error: error.message,
    });
  }
};


// Controller to get products by category with pagination
exports.productByCategory = async (req, res, next) => {
  try {
    // Extract category from query or params and convert to lowercase
    let category = req.query.category || req.params.category;
    if (!category) {
      return res.status(400).json({ success: false, message: 'Category is required.' });
    }
    category = category.toLowerCase();

    // Destructure and set defaults for pagination parameters
    const { page = 1, limit = 10 } = req.query;

    // Validate `page` and `limit` as positive integers
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    if (pageNumber < 1 || limitNumber < 1) {
      return res.status(400).json({
        success: false,
        message: 'Page and limit must be positive integers.',
      });
    }

    // Create a cache key based on category, page, and limit
    const cacheKey = `products_category_${category}_page_${pageNumber}_limit_${limitNumber}`;

    // Check if data exists in the cache
    const cachedData = myCache.get(cacheKey);
    if (cachedData) {
      return res.status(200).json(cachedData); // Return cached response
    }

    // Calculate the number of documents to skip
    const skip = (pageNumber - 1) * limitNumber;

    // Define the category filter
    const categoryFilter = { category: category };


    // Use aggregation for optimized data retrieval
    const [categoryData] = await productModel.aggregate([
      { $match: categoryFilter }, // Filter products by category
      {
        $facet: {
          products: [
            { $sort: { price: 1 } }, // Sort products by price in ascending order
            { $skip: skip }, // Skip products for pagination
            { $limit: limitNumber }, // Limit the number of returned products
            {
              $project: { // Return only necessary fields for better performance
                name: 1,
                price: 1,
                images: 1,
                category: 1,
                discount: 1,
                priceAfterDiscount: 1
              }
            }
          ],
          totalCount: [
            { $count: 'total' } // Count total products in the category
          ]
        }
      }
    ]);



    // Extract products and total count from the aggregation result
    const products = categoryData?.products || [];
    const totalProducts = categoryData?.totalCount[0]?.total || 0;

    // Calculate total number of pages
    const totalPages = Math.ceil(totalProducts / limitNumber);

    // If no products are found for the category
    if (products.length === 0) {
      return res.status(404).json({ success: false, message: 'No products found for this category.' });
    }

    // Format prices with commas for readability
    const formattedProducts = products.map(product => ({
      ...product,
      price: numberWithCommas(product.price),
      priceAfterDiscount: product.priceAfterDiscount ? numberWithCommas(product.priceAfterDiscount) : undefined
    }));

    // Prepare the response object
    const response = {
      success: true,
      products: formattedProducts,
      pagination: {
        totalProducts,
        totalPages,
        currentPage: pageNumber,
        itemsPerPage: limitNumber
      }
    };

    // Store the response in the cache
    myCache.set(cacheKey, response);

    // Send the response with products and pagination details
    res.status(200).json(response);
  } catch (error) {
    // Log the error and return a server error respons
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching products by category.',
      error: error.message
    });
  }
};


// sort products by min and max price of the products
exports.sortProducts = async (req, res, next) => {
  try {
    // Destructure and set defaults for query parameters
    const { minPrice, maxPrice, page = 1, limit = 10 } = req.query;

    // Convert `minPrice` and `maxPrice` to numbers and validate
    const min = parseFloat(minPrice);
    const max = parseFloat(maxPrice);

    if (!minPrice || !maxPrice || isNaN(min) || isNaN(max) || min > max) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid price range where minPrice <= maxPrice.',
      });
    }

    // Validate `page` and `limit` as positive integers
    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);
    if (pageNumber < 1 || limitNumber < 1) {
      return res.status(400).json({
        success: false,
        message: 'Page and limit must be positive integers.',
      });
    }

    // Create a cache key based on minPrice, maxPrice, page, and limit
    const cacheKey = `products_price_${min}_${max}_page_${pageNumber}_limit_${limitNumber}`;

    // Check if data exists in the cache
    const cachedData = myCache.get(cacheKey);
    if (cachedData) {
      return res.status(200).json(cachedData); // Return cached response
    }

    // Construct price filter object
    const priceFilter = { price: { $gte: min, $lte: max } };

    // Use aggregation for efficient data retrieval and handling
    const skip = (pageNumber - 1) * limitNumber;

    // Get total count and filtered products with one database call
    const [productsData] = await productModel.aggregate([
      { $match: priceFilter }, // Match products within the price range
      {
        $facet: {
          products: [
            { $sort: { price: 1 } }, // Sort by price in ascending order
            { $skip: skip }, // Skip products for pagination
            { $limit: limitNumber }, // Limit the number of returned products
            {
              $project: { // Return only necessary fields
                name: 1,
                price: 1,
                images: 1,
                category: 1,
                discount: 1,
                priceAfterDiscount: 1
              }
            }
          ],
          totalCount: [
            { $count: 'total' } // Get total count of products that match the filter
          ]
        }
      }
    ]);

    // Extract products and total count from the aggregation result
    const products = productsData.products || [];
    const totalProducts = productsData.totalCount[0]?.total || 0;

    // Calculate total number of pages
    const totalPages = Math.ceil(totalProducts / limitNumber);

    // If no products are found within the specified range
    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No products found within the specified price range.',
      });
    }

    // Prepare the response object
    const response = {
      success: true,
      products,
      pagination: {
        totalProducts,
        totalPages,
        currentPage: pageNumber,
        itemsPerPage: limitNumber
      }
    };

    // Store the response in the cache
    myCache.set(cacheKey, response);

    // Send response with products and pagination details
    res.status(200).json(response);
  } catch (error) {
    // Log the error and return a server error response
    console.error('Error in sortProducts:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching products.',
      error: error.message
    });
  }
};


// fetch single product by id
exports.singleProduct = async (req, res, next) => {
  // Function to format numbers with commas
  const numberWithCommas = (number) => {
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  try {
    // Extract product ID from request parameters or query
    const productId = req.params.id || req.query.id;

    // Fetch the product by ID
    const product = await productModel.findById(productId).exec();

    // Check if product was found
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Find similar products in the same category
    let similarProducts = await productModel.find({
      category: product.category,
      _id: { $ne: productId } // Exclude the current product
    }).limit(10).lean(); // Using .lean() to return plain JavaScript objects

    let responseProducts = [];

    // If similar products are found, set them as similarProducts
    if (similarProducts.length > 0) {
      responseProducts = similarProducts.map(item => ({
        ...item,
        price: numberWithCommas(item.price),
        priceAfterDiscount: item.priceAfterDiscount ? numberWithCommas(item.priceAfterDiscount) : undefined
      }));
    } else {
      // If no similar products are found, fetch random products
      const moreProducts = await productModel.aggregate([
        { $match: { _id: { $ne: productId } } }, // Exclude the current product
        { $sample: { size: 20 } } // Get up to 20 random products
      ]);

      responseProducts = moreProducts.map(item => ({
        ...item,
        price: numberWithCommas(item.price),
        priceAfterDiscount: item.priceAfterDiscount ? numberWithCommas(item.priceAfterDiscount) : undefined
      }));
    }

    // Format the single product
    const formattedProduct = {
      ...product.toObject(),
      price: numberWithCommas(product.price),
      priceAfterDiscount: product.priceAfterDiscount ? numberWithCommas(product.priceAfterDiscount) : undefined
    };

    // Prepare the response JSON structure
    const response = {
      success: true,
      product: formattedProduct,
      similarProducts: similarProducts.length > 0 ? responseProducts : undefined,
      moreProducts: similarProducts.length === 0 ? responseProducts : undefined
    };

    // Send the response
    res.status(200).json(response);

  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};


// update single product with id checking mode.
exports.updateProduct = async (req, res) => {
  try {
    const { name, description, price, category, stock, discount } = req.body;
    const productId = req.query.productId;

    if (!productId) return res.status(400).json({ success: false, message: "Please provide ProductId for update the details" })

    // Validate required fields
    const requiredFields = { name, description, price, category, stock, discount };
    for (const [key, value] of Object.entries(requiredFields)) {
      if (!value) {
        return res.status(400).json({ success: false, message: `${key.charAt(0).toUpperCase() + key.slice(1)} is required` });
      }
    }

    // Validate images
    if (!req.files) {
      return res.status(400).json({ success: false, message: "Please provide images" });
    }
    const images = req.files.map(file => ({
      url: file.path,
      public_id: file.filename
    }));

    // Sanitize and validate price
    const sanitizedPrice = parseFloat(price.replace(/,/g, ''));
    if (isNaN(sanitizedPrice) || sanitizedPrice < 0) {
      return res.status(400).json({ success: false, message: "Price must be a valid number greater than or equal to 0" });
    }

    // Sanitize and validate discount
    const numericDiscount = parseFloat(discount);
    if (isNaN(numericDiscount) || numericDiscount < 0 || numericDiscount > 100) {
      return res.status(400).json({ success: false, message: "Discount must be a number between 0 and 100" });
    }

    // Calculate the final price after discount
    const finalPrice = numericDiscount > 0 ? sanitizedPrice - (sanitizedPrice * (numericDiscount / 100)) : sanitizedPrice;

    // Update the product
    const updatedProduct = await productModel.findByIdAndUpdate(productId, {
      name,
      description,
      price: sanitizedPrice,
      priceAfterDiscount: finalPrice,
      category,
      stock,
      images,
      discount: numericDiscount
    }, { new: true, runValidators: true });

    if (!updatedProduct) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Format numbers with commas for the response
    const formattedProduct = {
      ...updatedProduct.toObject(),
      price: numberWithCommas(updatedProduct.price),
      priceAfterDiscount: numberWithCommas(updatedProduct.priceAfterDiscount)
    };

    // Return the response with formatted prices
    res.status(200).json({ success: true, product: formattedProduct });

  } catch (error) {
    const errorMessage = error.name === 'ValidationError' ? error.message : "Internal Server Error";
    const statusCode = error.kind === 'ObjectId' ? 400 : 500;
    res.status(statusCode).json({ success: false, message: errorMessage });
  }
};


// /deleteProduct form id
exports.deleteProduct = async (req, res, next) => {
  try {
    // Extract product ID from request parameters in a more explicit way
    const productId = req.query.id || req.body.id;

    // Validate if the product ID is provided
    if (!productId) {
      return res.status(400).json({ success: false, message: "Product ID is required" });
    }

    // Attempt to delete the product by ID
    const deletedProduct = await productModel.findByIdAndDelete(productId);
    if (deletedProduct && deletedProduct.images)

      // Check if the product was successfully deleted
      if (!deletedProduct) {
        return res.status(404).json({ success: false, message: "Product not found" });
      }

    // Send success response
    res.status(200).json({
      success: true,
      message: "Product deleted successfully"
    });

  } catch (error) {
    // Log the error for debugging purposes
    console.error("Error deleting product:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};


// search products  
exports.searchProducts = async (req, res, next) => {
  try {
    const { query } = req.query; // Retrieve the search query from the request

    // Check if the query parameter is provided
    if (!query) {
      return res.status(400).json({ success: false, message: 'Query is required' });
    }

    // Create a case-insensitive regex pattern for matching the query
    const regexPattern = new RegExp(query, 'i');

    // Create a cache key based on the query
    const cacheKey = `search_${query}`;

    // Check if data exists in the cache
    const cachedData = myCache.get(cacheKey);
    if (cachedData) {
      return res.status(200).json(cachedData); // Return cached response
    }

    // Find products that match the query in title, category, or any other fields
    const products = await productModel.find({
      $or: [
        { name: { $regex: regexPattern } },
        { category: { $regex: regexPattern } },
        { description: { $regex: regexPattern } },
      ]
    }).lean(); // Use .lean() to return plain JavaScript objects for better performance

    // Check if no products were found
    if (products.length === 0) {
      return res.status(404).json({ success: false, message: 'No products found' });
    }

    // Prepare the response object
    const response = { success: true, products };

    // Store the response in the cache
    myCache.set(cacheKey, response);

    // Send the response with found products
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};


// add reviews to rate the product by comment rating number.
exports.addReview = async (req, res) => {
  try {
    const { productId, rating, comment } = req.body;
    const loginuser = await userModel.findOne({ email: req.user.email })
    // Assuming you're using authentication
    if (!loginuser) {
      return res.status(403).json({ success: false, message: "Login user not found!" })
    }
    // Validate input fields
    if (!productId || !rating || !comment) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    // Check if the product exists
    const product = await productModel.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Check if user already reviewed this product
    const existingReview = await reviewModel.findOne({ user: loginuser._id, product: productId });
    if (existingReview) {
      return res.status(400).json({ success: false, message: "You have already reviewed this product" });
    }

    // Create the new review
    const review = await reviewModel.create({
      user: loginuser._id,
      product: productId,
      rating,
      comment
    });

    // Update product's review stats (optional)
    product.reviews.push(review._id);
    await product.save();
    await loginuser.save();

    // Send response
    res.status(201).json({
      success: true,
      message: 'Review added successfully',
      review
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};


// reviews of the product by Id
exports.getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params || req.query;

    // Check if the product exists
    const product = await productModel.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Create a cache key based on the product ID
    const cacheKey = `reviews_${productId}`;

    // Check if reviews exist in the cache
    const cachedReviews = myCache.get(cacheKey);
    if (cachedReviews) {
      return res.status(200).json(cachedReviews); // Return cached response
    }

    // Find all reviews related to this product
    const reviews = await reviewModel.find({ product: productId })
      .populate('user', 'username profile') // Populating the user details (optional)
      .sort({ createdAt: -1 }); // Sort by newest first (optional)

    if (reviews.length === 0) {
      return res.status(404).json({ success: false, message: "No reviews found for this product" });
    }

    // Prepare the response object
    const response = {
      success: true,
      reviews,
    };

    // Store the reviews in the cache
    myCache.set(cacheKey, response);

    // Return the reviews
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.deleteImageFromCloudinary = async (req, res) => {
  try {
    const { public_id } = req.body;
    if (!public_id) { return res.status(400).json({ success: false, message: "public_id is required" }) };
    const result = await Cloudinary.uploader.destroy(public_id)
    if (!result || result.result !== "ok") { return res.status(400).json({ success: false, message: "Image not found or image Already Deleted" })};
    res.status(200).json({
      success: true,
      result: result,
      message: "Image Delete successfull"
    });

  }catch(e){
    res.status(500).json({
      success: false,
      message: e.message
    })
  };

}








