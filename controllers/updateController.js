const Transaction = require("../models/transactionModel");
exports.updateController = async(req, res)=>{
    try{
        const {transaction_id, ruleBasedResult, secondRouteResult} = req.body;
        const transaction = await Transaction.findOne({ transaction_id : transaction_id});
        if (!transaction) {
            console.log("Transaction not found!");
            return res.status(404).json({
                success: false,
                message: `Transaction not found`
            })
        }
        console.log("Original Transaction:", transaction);

        if(ruleBasedResult && secondRouteResult){
            const result = await Transaction.updateOne(
                { _id: transaction._id },
                { $set: { is_fraud: true } }
            );
        }

        // if (result.modifiedCount > 0) {
        //     console.log(`Transaction ${transaction_id} marked as fraud!`);
        // } else {
        //     console.log("No changes were made.");
        // }

        return res.status(200).json({
            success: true,
            message: "Marked securely",
            transaction_id: transaction.transaction_id
        });
    }
    catch(error){
        console.log(error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        })
    }
}