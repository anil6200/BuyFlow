require('dotenv').config();
const mongoose = require('mongoose');
const uri = process.env.MONGO_URL;
exports.DbConnection = async(req, res, err) => {

    await mongoose.connect(uri)
        .then(function() {
          console.info("Connected to DB Successfully")
        })
        .catch(function(error) {
            console.warn(error.message);
        });

}