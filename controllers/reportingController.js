const transactionModel = require('../models/transactionModel');
const fraudReportingModel = require('../models/fraud_reporting');

const reportFraud = async (req, res) => {
    try {
        const { transaction_id } = req.body;

        // Validate required fields
        if (!transaction_id) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields"
            });
        }

        // Find the transaction
        const transaction = await transactionModel.findOne({ transaction_id });
        
        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: "Transaction not found"
            });
        }

        // Check if transaction is marked as fraud
        // if (!transaction.is_fraud) {
        //     return res.status(400).json({
        //         success: false,
        //         message: "Cannot report fraud for a transaction that is not marked as fraudulent"
        //     });
        // }

        // Update the transaction with fraud report

        // Create a new fraud report
        const fraudReport = new fraudReportingModel({
            transaction_id: transaction._id,
            is_fraud: true,
            is_fraud_reported: true,
            reporting_entity_id: "SEBI - ID"
        });
        await fraudReport.save();

        return res.status(200).json({
            success: true,
            message: "Fraud reported successfully",
            data: {
                transaction_id: transaction.transaction_id,
                is_fraud: transaction.is_fraud,
                is_fraud_reported: transaction.is_fraud_reported,
            }
        });

    } catch (error) {
        console.error("Error in reportFraud:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

module.exports = {
    reportFraud
};
