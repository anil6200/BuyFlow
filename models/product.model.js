const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const shortid = require("shortid")

const productSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: [3, 'Name must be at least 3 characters long']
    },
    description: {
        type: String,
        required: true,
        trim: true,
        minlength: [10, 'Description must be at least 10 characters long']
    },
    price: {
        type: Number,
        required: true,
        min: [0, 'Price must be a positive number']
    },
    priceAfterDiscount: {
        type: Number,
        min: [0, 'Price after discount must be a positive number']
    },
    category: {
        type: String,
        required: true,
        // enum: {
        //     values: ['electronics', 'clothing', 'home', 'sports', 'kids', 'footwear', 'cosmetics', 'mens', 'womens'],
        //     message: 'Category is not valid'
        // }
    },
    stock: {
        type: Number,
        required: true,
        min: [0, 'Stock must be a non-negative number']
    },
    images: [{
        url:String,
        public_id:String
    }],
    discount: {
        type: Number,
        min: [0, 'Discount must be between 0 and 100'],
        max: [100, 'Discount must be between 0 and 100']
    },
    reviews: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Review'
      }],
      shareId :{
        type :String,
        default : shortid.generate,
        unique:true
      }

}, { timestamps: true });

// Pre-save hook to normalize the category to lowercase and calculate price after discount
productSchema.pre('save', function (next) {
    if (this.isModified('category')) {
        this.category = this.category.toLowerCase();
    }
    
    if (this.isModified('price') || this.isModified('discount')) {
        let finalPrice = this.price;
        if (this.discount > 0) {
            finalPrice = this.price - (this.price * (this.discount / 100));
        }
        this.priceAfterDiscount = finalPrice;
    }

    next();
});

const Product = mongoose.model('Product', productSchema);
module.exports = Product;