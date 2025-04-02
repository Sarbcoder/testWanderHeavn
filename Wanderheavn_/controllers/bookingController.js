require('dotenv').config(); // Make sure this line is at the top
const Listing = require("../models/listing");
const Booking = require("../models/booking");
const Razorpay = require("razorpay");  // Import Razorpay
const crypto = require("crypto");
//adddeddd
// Initialize Razorpay with your key and secret from .env
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});
module.exports.getBookingPage = async (req, res) => {
    const { id } = req.params;
    const listing = await Listing.findById(id);

    if (!listing) {
        req.flash("error", "Listing not found!");
        return res.redirect("/listings");
    }

    res.render("bookings/book", { listing, currUser: req.user });
};

// Create Booking (Temporary Data)
module.exports.createBooking = async (req, res) => {
    const { id } = req.params;
    const { bookingDates } = req.body;

    if (!bookingDates || bookingDates.length === 0) {
        req.flash("error", "Please select at least two consecutive dates for booking.");
        return res.redirect(`/listings/${id}/book`);
    }

    const listing = await Listing.findById(id);
    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    // Convert selected dates to YYYY-MM-DD format
    const selectedDates = bookingDates.split(",").map(date => new Date(date).toISOString().split("T")[0]);

    // Ensure at least 2 dates are selected
    if (selectedDates.length < 2) {
        req.flash("error", "Please select at least two consecutive dates for booking.");
        return res.redirect(`/listings/${id}/book`);
    }

    // Ensure bookedDates are also in YYYY-MM-DD format before checking
    const bookedDates = listing.bookedDates.map(date => new Date(date).toISOString().split("T")[0]);

    // Check if any selected date is already in the bookedDates array
    const alreadyBooked = selectedDates.some(date => bookedDates.includes(date));

    if (alreadyBooked) {
        req.flash("error", "One or more selected dates are already booked.");
        return res.redirect(`/listings/${id}/book`);
    }

    // Pass temporary booking data via query parameters
    res.redirect(`/listings/${id}/payment?dates=${selectedDates.join(",")}&listingId=${listing._id}`);
};
// Get Payment Page (No data saved in DB yet)Invalid payment request.
module.exports.getPaymentPage = async (req, res) => {
    const { id } = req.params;
    const { dates, listingId } = req.query;  // Temporary data passed in query

    if (!dates || !listingId) {
        req.flash("error", "Invalid booking request.");
        return res.redirect(`/listings/${id}/book`);
    }

    try {
        const listing = await Listing.findById(listingId);

        if (!listing) {
            req.flash("error", "Listing not found.");
            return res.redirect(`/listings/${id}/book`);
        }

        // Prepare the booking data for the user to review in the payment process
        const selectedDates = dates.split(",");
        const totalPrice = selectedDates.length * listing.price;

        res.render("bookings/payment", { selectedDates, booking: { property: listing, bookedDates: selectedDates, totalPrice } });
    } catch (err) {
        req.flash("error", "Something went wrong.");
        return res.redirect(`/listings/${id}/book`);
    }
};

// module.exports.processPayment = async (req, res) => { 
//     console.log("Received Data:", req.body, req.query); // Log both req.body and req.query

//     // Handle both GET and POST data sources
//     const bookingDates = req.body.bookingDates || req.query.dates;
//     const listingId = req.body.listingId || req.query.listingId;

//     if (!bookingDates || !listingId) {
//         console.log("Error: Missing bookingDates or listingId");
//         req.flash("error", "Invalid payment request.");
//         return res.redirect("back");
//     }

//     const listing = await Listing.findById(listingId);
//     if (!listing) {
//         console.log("Error: Listing not found for ID:", listingId);
//         req.flash("error", "Listing not found.");
//         return res.redirect("back");
//     }

//     const selectedDates = bookingDates.split(",").map(date => date.trim());

//     const newBooking = new Booking({
//         property: listingId,
//         guest: req.user._id,
//         host: listing.owner,
//         bookedDates: selectedDates,
//         totalPrice: selectedDates.length * listing.price,
//         status: "Paid"
//     });

//     await newBooking.save();

//     listing.bookedDates.push(...selectedDates);
//     await listing.save();

//     req.flash("success", "Payment successful! Your booking is confirmed.");
//     res.redirect(`/listings/${listing._id}/confirmation?bookingId=${newBooking._id}`);
// };

// const Razorpay = require("razorpay");

module.exports.processPayment = async (req, res) => {
    try {
        // ✅ Ensure JSON parsing middleware is enabled
        console.log("📢 Full Received Request Body:", req.body);

        const listingId = req.params.id;
        const bookingDates = req.body.bookingDates;

        console.log("📢 Received bookingDates:", bookingDates, "Listing ID:", listingId);

        // ✅ Validate required fields
        if (!bookingDates || !listingId || typeof bookingDates !== "string") {
            console.log("❌ Error: Missing bookingDates or listingId");
            return res.status(400).json({ success: false, message: "Invalid payment request." });
        }

        // ✅ Find the listing
        const listing = await Listing.findById(listingId);
        if (!listing) {
            console.log(`❌ Error: Listing not found for ID: ${listingId}`);
            return res.status(404).json({ success: false, message: "Listing not found." });
        }

        if (!listing.price) {
            console.log("❌ Error: Listing price is missing.");
            return res.status(400).json({ success: false, message: "Invalid listing price." });
        }

        // ✅ Parse booking dates and calculate total price
        const selectedDates = bookingDates.split(",").map(date => date.trim());
        const totalPrice = selectedDates.length * listing.price;
        console.log("🔎 Razorpay Key ID:", process.env.RAZORPAY_KEY_ID);
        console.log("🔎 Razorpay Key Secret:", process.env.RAZORPAY_KEY_SECRET);
        
        // ✅ Validate Razorpay API keys before creating order
        if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
            console.log("❌ Error: Razorpay API keys missing.");
            return res.status(500).json({ success: false, message: "Payment service unavailable." });
        }

        // ✅ Prepare Razorpay Order Options
        const orderOptions = {
            amount: totalPrice * 100, // Convert to paise
            currency: "INR",
            receipt: `order_${new Date().getTime()}`,
            payment_capture: 1,
        };

        console.log("🛒 Creating Razorpay Order with options:", orderOptions);

        try {
            const razorpayOrder = await razorpay.orders.create(orderOptions);
            console.log("✅ Razorpay Order Created:", razorpayOrder);
            const listing = await Listing.findById(listingId).populate({ path: "owner", model: "Host" });

            console.log("🔎 Listing Owner ID:", listing.owner);

            const newBooking = new Booking({
                property: listingId,
                guest: req.user._id,
                host: listing.owner._id,  // ✅ Store the ID, NOT username
                bookedDates: selectedDates,
                totalPrice,
                status: "Pending",
                orderId: razorpayOrder.id,
            });

            await newBooking.save();

            return res.json({
                success: true,
                message: "Razorpay order created successfully",
                orderId: razorpayOrder.id,
                amount: totalPrice * 100,
                currency: "INR",
                key: process.env.RAZORPAY_KEY_ID,
                bookingId: newBooking._id,
            });

        } catch (razorpayError) {
            console.error("❌ Razorpay Error:", razorpayError);
            return res.status(500).json({ success: false, message: "Payment processing failed." });
        }

    } catch (err) {
        console.error("❌ Error processing payment:", err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};


// / 🏦 **Process Payment & Create Razorpay Order**

// module.exports.processPayment = async (req, res) => {
//     try {
//         const listingId = req.params.id;
//         const { bookingDates } = req.body;

//         if (!bookingDates || !listingId) {
//             console.log("❌ Error: Missing bookingDates or listingId");
//             return res.status(400).json({ success: false, message: "Invalid payment request." });
//         }

//         // Find the listing
//         const listing = await Listing.findById(listingId);
//         if (!listing) {
//             console.log(`❌ Error: Listing not found for ID: ${listingId}`);
//             return res.status(404).json({ success: false, message: "Listing not found." });
//         }

//         // Parse selected booking dates
//         const selectedDates = bookingDates.split(",").map(date => date.trim());
//         const totalPrice = selectedDates.length * listing.price;

//         // Prepare Razorpay Order Options
//         const orderOptions = {
//             amount: totalPrice * 100, // Convert to paise
//             currency: "INR",
//             receipt: `order_${new Date().getTime()}`,
//             payment_capture: 1,
//         };

//         // Create Razorpay Order
//         console.log("🛒 Creating Razorpay Order with options:", orderOptions);
//         const razorpayOrder = await razorpay.orders.create(orderOptions);
//         if (!razorpayOrder.id) {
//             throw new Error("❌ Razorpay order ID is missing");
//         }
//         console.log("✅ Razorpay Order Created:", razorpayOrder);

//         // Create Booking with Order ID
//         const newBooking = new Booking({
//             property: listingId,
//             guest: req.user._id,
//             host: listing.owner,
//             bookedDates: selectedDates,
//             totalPrice,
//             status: "Pending",
//             orderId: razorpayOrder.id, // ✅ Store orderId correctly
//         });

//         await newBooking.save();

//         // Send response to frontend
//         return res.json({
//             success: true,
//             message: "Razorpay order created successfully",
//             orderId: razorpayOrder.id, // ✅ Order ID sent here
//             amount: totalPrice * 100,
//             currency: "INR",
//             key: process.env.RAZORPAY_KEY_ID,
//             bookingId: newBooking._id,
//         });

//     } catch (err) {
//         console.error("❌ Error processing payment:", err.message);
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };

// ✅ **Verify Payment & Confirm Booking**
module.exports.verifyPayment = async (req, res) => {
    try {
        const { paymentId, orderId, signature } = req.body;

        // ✅ Find existing booking associated with orderId
        let booking = await Booking.findOne({ orderId });

        if (!booking) {
            console.error("❌ No booking found for orderId:", orderId);
            return res.status(400).json({ success: false, message: "Invalid booking." });
        }

        // ✅ Update booking status & store payment ID
        booking.razorpayPaymentId = paymentId;
        booking.status = "Confirmed";
        await booking.save();

        console.log("✅ Payment Verified & Booking Confirmed:", booking._id);

        res.json({ success: true, bookingId: booking._id });
    } catch (error) {
        console.error("❌ Error verifying payment:", error);
        res.status(500).json({ success: false, message: "Payment verification failed." });
    }
};

// module.exports.verifyPayment = async (req, res) => {
//     try {
//         const { paymentId, orderId, signature, bookingId } = req.body;

//         console.log("🛠️ Verifying Payment:", { paymentId, orderId, signature, bookingId });

//         if (!paymentId || !orderId || !signature || !bookingId) {
//             throw new Error("Missing payment details!");
//         }

//         // Verify payment signature
//         const generatedSignature = crypto
//             .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
//             .update(orderId + "|" + paymentId)
//             .digest("hex");

//         if (generatedSignature !== signature) {
//             throw new Error("Invalid payment signature!");
//         }

//         // Update Booking Status
//         const booking = await Booking.findById(bookingId);
//         if (!booking) {
//             throw new Error("Booking not found!");
//         }

//         booking.status = "Confirmed";
//         booking.razorpayPaymentId = paymentId;
//         await booking.save();

//         console.log("✅ Payment Verified & Booking Confirmed!");

//         return res.json({ success: true, message: "Payment verified successfully!", bookingId });

//     } catch (err) {
//         console.error("❌ Payment Verification Failed:", err.message);
//         return res.status(400).json({ success: false, message: err.message });
//     }
// };

// module.exports.processPayment = async (req, res) => {
//     try {
//         const listingId = req.params.id;
//         const { bookingDates } = req.body;

//         if (!bookingDates || !listingId) {
//             console.log("❌ Error: Missing bookingDates or listingId");
//             req.flash("error", "Invalid payment request.");
//             return res.redirect("back");
//         }

//         // Find the listing
//         const listing = await Listing.findById(listingId);
//         if (!listing) {
//             console.log(`❌ Error: Listing not found for ID: ${listingId}`);
//             req.flash("error", "Listing not found.");
//             return res.redirect("back");
//         }

//         // Parse selected booking dates
//         const selectedDates = bookingDates.split(",").map(date => date.trim());
//         const totalPrice = selectedDates.length * listing.price;

//         // Prepare Razorpay order options
//         const orderOptions = {
//             amount: totalPrice * 100, // Convert to paise
//             currency: "INR",
//             receipt: `order_${new Date().getTime()}`,
//             payment_capture: 1,
//         };
        
//         // Create Razorpay Order
//         console.log("🛒 Creating Razorpay Order with options:", orderOptions);
//         const razorpayOrder = await razorpay.orders.create(orderOptions);
//         if (!razorpayOrder.id) {
//             throw new Error("❌ Razorpay order ID is missing");
//         }
//         console.log("✅ Razorpay Order Created:", razorpayOrder);
        
//         // Now create the booking after generating order ID
//         const newBooking = new Booking({
//             property: listingId,
//             guest: req.user._id,
//             host: listing.owner,
//             bookedDates: selectedDates,
//             totalPrice,
//             status: "Pending",
//             razorpayOrderId: razorpayOrder.id, // Store Razorpay order ID
//         });
//         await newBooking.save();
        
//         // Send response to frontend
//         return res.json({
//             success: true,
//             message: "Razorpay order created successfully",
//             razorpayOrderId: razorpayOrder.id, // Order ID sent here
//             amount: totalPrice * 100,
//             currency: "INR",
//             key:"rzp_test_RXdJ27fSfKQMeT",
//             bookingId: newBooking._id,
//         });
        

//     } catch (err) {
//         console.error("❌ Error processing payment:", err.message);
//         req.flash("error", "Something went wrong during payment processing.");
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };

// module.exports.processPayment = async (req, res) => {
//     const listingId = req.params.id; // Get the listing ID from the URL parameter
//     const bookingDates = req.body.bookingDates;

//     if (!bookingDates || !listingId) {
//         console.log("Error: Missing bookingDates or listingId");
//         req.flash("error", "Invalid payment request.");
//         return res.redirect("back");
//     }

//     const listing = await Listing.findById(listingId);
//     if (!listing) {
//         console.log("Error: Listing not found for ID:", listingId);
//         req.flash("error", "Listing not found.");
//         return res.redirect("back");
//     }

//     const selectedDates = bookingDates.split(",").map(date => date.trim());

//     const totalPrice = selectedDates.length * listing.price;

//     // Create a Razorpay order
//     const orderOptions = {
//         amount: totalPrice * 100, // amount in paise
//         currency: "INR",
//         receipt: `order_${new Date().getTime()}`,
//         payment_capture: 1, // Automatically capture payment after successful transaction
//     };

//     try {
//         const razorpayOrder = await razorpay.orders.create(orderOptions);

//         // Prepare the booking data
//         const newBooking = new Booking({
//             property: listingId,
//             guest: req.user._id,
//             host: listing.owner,
//             bookedDates: selectedDates,
//             totalPrice,
//             status: "Pending", // Initially marked as pending
//             razorpayOrderId: razorpayOrder.id, // Store Razorpay order ID for reference
//         });

//         await newBooking.save();

//         // Add booked dates to the listing
//         listing.bookedDates.push(...selectedDates);
//         await listing.save();
//         console.log("Razorpay Key ID:", process.env.RAZORPAY_KEY_ID);

//         // Pass Razorpay order details to the frontend
//         res.render("bookings/payment", {
//             booking: { ...newBooking._doc, razorpayOrderId: razorpayOrder.id },
//             razorpayKeyId: process.env.RAZORPAY_KEY_ID,  user: req.user
//         });

//     } catch (err) {
//         console.error("Razorpay Order Creation Failed:", err);
//         req.flash("error", "Something went wrong during payment processing.");
//         return res.redirect("back");
//     }
// }

// module.exports.processPayment = async (req, res) => {
//     console.log(req.body);  // Debugging: Check what data is being received

//     const { bookingDates, listingId } = req.body;  // Dates and listingId received from the payment form

//     if (!bookingDates || !listingId) {
//         req.flash("error", "Invalid payment request.");
//         return res.redirect("back");
//     }

//     const listing = await Listing.findById(listingId);

//     if (!listing) {
//         req.flash("error", "Listing not found.");
//         return res.redirect("back");
//     }

//     // Convert dates to the proper format (same as during booking creation)
//     const selectedDates = bookingDates.split(",");

//     // Store the new booking in the database
//     const newBooking = new Booking({
//         property: listingId,
//         guest: req.user._id,
//         host: listing.owner,
//         bookedDates: selectedDates, // Save only booked dates
//         totalPrice: selectedDates.length * listing.price,
//         status: "Paid" // Mark as paid upon payment confirmation
//     });

//     await newBooking.save();

//     // Add booked dates to Listing model
//     listing.bookedDates.push(...selectedDates);
//     await listing.save();

//     req.flash("success", "Payment successful! Your booking is confirmed.");

//     // Redirect to confirmation page with the booking ID
//     res.redirect(`/listings/${listing._id}/confirmation?bookingId=${newBooking._id}`);
// };

// // Get Confirmation Page (After Successful Payment)
// const crypto = require("crypto");

// module.exports.verifyPayment = async (req, res) => {
//     const { paymentId, orderId, signature, bookingId } = req.body;
//     console.log("Received Payment Data:", {
//         paymentId,
//         orderId,
//         signature,
//         bookingId
//     })
//     // Retrieve the order details from Razorpay using the order ID
//     const body = orderId + "|" + paymentId;
//     const expectedSignature = crypto
//         .createHmac("sha256", "HNuxjehCVq2rJISpEFcBKEby") // Use Razorpay secret key to generate the signature
//         .update(body)
//         .digest("hex");

//     if (signature === expectedSignature) {
//         // Payment is verified, update booking status
//         try {
//             const booking = await Booking.findById(bookingId);
//             if (booking) {
//                 booking.status = "Paid"; // Update booking status to "Paid"
//                 await booking.save();

//                 // Respond with success
//                 res.json({
//                     success: true,
//                     bookingId: booking._id,
//                 });
//             } else {
//                 res.json({
//                     success: false,
//                     message: "Booking not found.",
//                 });
//             }
//         } catch (err) {
//             console.error("Error while verifying payment:", err);
//             res.json({
//                 success: false,
//                 message: "An error occurred while processing the payment.",
//             });
//         }
//     } else {
//         res.json({
//             success: false,
//             message: "Payment signature mismatch.",
//         });
//     }
// };
// const crypto = require("crypto");

// module.exports.verifyPayment = async (req, res) => {
//     try {
//         const { paymentId, orderId, signature, bookingId } = req.body;

//         console.log("🛠️ Verifying Payment:", { paymentId, orderId, signature, bookingId });

//         if (!paymentId || !orderId || !signature || !bookingId) {
//             throw new Error("Missing payment details!");
//         }

//         // Verify payment signature
//         const generatedSignature = crypto
//             .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
//             .update(orderId + "|" + paymentId)
//             .digest("hex");

//         if (generatedSignature !== signature) {
//             throw new Error("Invalid payment signature!");
//         }

//         // Update Booking Status
//         const booking = await Booking.findById(bookingId);
//         if (!booking) {
//             throw new Error("Booking not found!");
//         }

//         booking.status = "Confirmed";
//         booking.razorpayPaymentId = paymentId;
//         await booking.save();

//         console.log("✅ Payment Verified & Booking Confirmed!");

//         return res.json({ success: true, message: "Payment verified successfully!" });

//     } catch (err) {
//         console.error("❌ Payment Verification Failed:", err.message);
//         return res.status(400).json({ success: false, message: err.message });
//     }
// };

// module.exports.verifyPayment = async (req, res) => {
//     const { paymentId, orderId, signature, bookingId } = req.body;

//     const generatedSignature = crypto
//         .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
//         .update(orderId + "|" + paymentId)
//         .digest("hex");

//     if (generatedSignature !== signature) {
//         req.flash("error", "Payment verification failed.");
//         return res.status(400).send({ success: false });
//     }

//     const booking = await Booking.findById(bookingId);
//     if (!booking) {
//         req.flash("error", "Booking not found.");
//         return res.status(400).send({ success: false });
//     }

//     // Update the booking status to 'Paid'
//     booking.status = "Paid";
//     await booking.save();

//     // Redirect to confirmation page
//     return res.status(200).send({ success: true, bookingId: booking._id });
// };

// module.exports.getConfirmationPage = async (req, res) => {
//     const { bookingId } = req.query;

//     if (!bookingId) {
//         req.flash("error", "Invalid booking.");
//         return res.redirect("/listings");
//     }

//     const booking = await Booking.findById(bookingId).populate("property")  .populate("guest")
//     .populate("host");;

//     if (!booking) {
//         req.flash("error", "Booking not found.");
//         return res.redirect("/listings");
//     }

//     res.render("bookings/confirmation", { booking, currUser: req.user });
// };
module.exports.getConfirmationPage = async (req, res) => {
    const { bookingId } = req.query;

    if (!bookingId) {
        req.flash("error", "Invalid booking.");
        return res.redirect("/listings");
    }

    const booking = await Booking.findById(bookingId)
         .populate({ path: "host", select: "username email" })  // Select only required fields
    .populate({ path: "guest", select: "username email" })
    .populate("property");

    if (!booking) {
        req.flash("error", "Booking not found.");
        return res.redirect("/listings");
    }

    console.log("✅ Loaded Booking Confirmation for ID:", bookingId);

    res.render("bookings/confirmation", { booking, currUser: req.user });
};
