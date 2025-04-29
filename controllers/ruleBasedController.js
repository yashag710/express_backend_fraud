const Transaction = require("../models/transactionModel"); // Adjust path as needed
const Payer = require("../models/payerModel"); // Adjust path as needed
const Payee = require("../models/payeeModel"); // Adjust path as needed
const geoip = require('geoip-lite'); // You'll need to install this package

// Set fraud score benchmark - transactions with scores above this are considered fraudulent
const FRAUD_SCORE_THRESHOLD = 0.7;

exports.checkFraud = async (req, res) => {
  try {
    const {
      ip,
      amount, 
      payment_mode,
      payment_channel,
      payee_id,
      payer_id,
      state,
      transaction_id
    } = req.body;
    
    // Create new transaction with MongoDB's _id as transaction_id
    const transaction = await Transaction.create({
      ip,
      amount,
      payment_mode,
      payment_channel,
      payee_id,
      payer_id,
      state,
      payment: 'pending',  // Default payment status
      transaction_id
    });

    // Set transaction_id to MongoDB's _id
    // transaction.transaction_id = transaction._id.toString();
    // await transaction.save();

    // Initialize fraud detection variables
    let fraudReason = "No fraud detected";
    let fraudScore = 0.0;
    let fraudFlags = [];
    
    // Get country from IP address
    const geo = geoip.lookup(ip);
    const country = geo ? geo.country : null;
    
    // Validate payer and payee existence
    const payerExists = await Payer.findOne({ payer_id });
    const payeeExists = await Payee.findOne({ payee_id });
    
    // if (!payerExists) {
    //   fraudFlags.push("Payer not found in database");
    //   fraudScore += 0.6;
    // }
    
    // if (!payeeExists) {
    //   fraudFlags.push("Payee not found in database");
    //   fraudScore += 0.6;
    // }
    
    // Get user's transaction history and failed attempts
    const userTransactions = await getUserTransactionHistory(payer_id);
    const failed_attempts = await getFailedAttempts(payer_id);
    
    // === AMOUNT-BASED RULES ===
    // Check transaction amount thresholds
    if (amount > 10000) {
      fraudFlags.push("High-value transaction");
      fraudScore += 0.4;
    }
    
    // Suspicious exact amounts (common in testing fraud)
    if (amount === 1000 || amount === 500 || amount % 1000 === 0) {
      fraudFlags.push("Round amount transaction");
      fraudScore += 0.1;
    }

    // === LOCATION-BASED RULES ===
    // High-risk countries list
    const highRiskCountries = ["PK", "US", "IR", "BY", "RU"];
    if (country && highRiskCountries.includes(country)) {
      fraudFlags.push(`Transaction from high-risk country: ${country}`);
      fraudScore += 0.6;
    }
    
    // High-risk states (if transaction is domestic)
    const highRiskStates = ["Bihar", "Jharkhand", "West Bengal"];
    if (state && highRiskStates.includes(state.toLowerCase())) {
      fraudFlags.push(`Transaction from high-risk state: ${state}`);
      fraudScore += 0.3;
    }
    
    // IP address checks
    // Check for known fraudulent IPs
    const knownFraudIPs = await getFraudulentIPs();
    if (knownFraudIPs.includes(ip)) {
      fraudFlags.push("Known fraudulent IP address");
      fraudScore += 0.8;
    }
    
    // === PAYER-PAYEE RELATIONSHIP VALIDATION ===
    // Check if payer and payee have transacted before (this checks past transactions, not the current one)
    const priorTransactions = await validatePayerPayeeRelationship(payer_id, payee_id);
    
    // Modified approach to handle new payer-payee relationships
    if (priorTransactions === 0) {
      // For completely new users, apply higher risk score
      if (userTransactions.length === 0) {
        fraudFlags.push("New user with first transaction");
        fraudScore += 0.4;
      }
      // For users with some transaction history but first time with this payee
      else if (userTransactions.length > 0 && userTransactions.length <= 5) {
        fraudFlags.push("New user's first transaction with this payee");
        fraudScore += 0.3;
      }
      // For established users with a new payee, lower risk but still flagged
      else {
        fraudFlags.push("Established user's first transaction with this payee");
        fraudScore += 0.2;
      }
    }
    
    // === VELOCITY AND PATTERN CHECKS ===
    // Check for multiple failed attempts
    if (failed_attempts >= 3) {
      fraudFlags.push("Multiple failed attempts");
      fraudScore += 0.5;
    }
    
    // Check for rapid succession transactions
    const recentTransactionCount = await getRecentTransactionCount(payer_id, 60); // Last 60 minutes
    if (recentTransactionCount > 5) {
      fraudFlags.push("Unusual transaction frequency");
      fraudScore += 0.3;
    }

    // === BEHAVIORAL ANALYSIS ===
    // Check if transaction amount is significantly higher than user's average
    const userAvgAmount = calculateAverageTransactionAmount(userTransactions);
    if (userAvgAmount && amount > userAvgAmount * 5) {
      fraudFlags.push("Amount significantly above user average");
      fraudScore += 0.5;
    }
    
    // Check if transaction is outside user's typical geographic area
    const userCommonStates = getCommonStates(userTransactions);
    if (userCommonStates.length > 0 && state && 
        !userCommonStates.includes(state.toLowerCase())) {
      fraudFlags.push("Unusual location for user");
      fraudScore += 0.4;
    }

    // === PAYMENT METHOD RISK ===
    // Certain payment methods might be higher risk
    const highRiskPaymentModes = ["cryptocurrency", "wire_transfer", "gift_card"];
    if (highRiskPaymentModes.includes(payment_mode)) {
      fraudFlags.push("High-risk payment method");
      fraudScore += 0.4;
    }
    
    // === PAYMENT CHANNEL RISK ===
    // Some channels are more susceptible to fraud
    const highRiskChannels = ["api", "third_party_processor"];
    if (highRiskChannels.includes(payment_channel)) {
      fraudFlags.push("High-risk payment channel");
      fraudScore += 0.3;
    }
    
    // === PAYEE RISK ANALYSIS ===
    const payeeFraudRatio = await getPayeeFraudRatio(payee_id);
    if (payeeFraudRatio > 0.1) { // More than 10% fraud rate
      fraudFlags.push("Payee has high fraud rate");
      fraudScore += 0.5;
    }

    // Normalize fraud score between 0 and 1
    fraudScore = Math.min(fraudScore, 1.0);

    // Determine if transaction is fraudulent based on score threshold
    const isFraud = fraudScore >= FRAUD_SCORE_THRESHOLD;
    
    // Compile the primary reason if fraud is detected
    if (isFraud && fraudFlags.length > 0) {
      // Find the flag with the highest impact (would be better to track scores per flag)
      // For now, just use the first flag as the primary reason
      fraudReason = fraudFlags[0];
    }

    // Note: We're not saving fraud analysis to the transaction record yet
    // since this is a pre-transaction check
    // We'll only create and store this data if the transaction proceeds

    // Return result with transaction ID in the exact format requested
    return res.status(200).json({
      transaction_id: transaction.transaction_id,
      is_fraud: isFraud,
      fraud_reason: fraudReason,
      fraud_score: fraudScore,
      failed_attempts: failed_attempts
    });
  } catch (error) {
    console.error("Fraud detection error:", error);
    return res.status(500).json({
      transaction_id: "unknown",
      is_fraud: false,
      fraud_reason: "Error processing fraud detection",
      fraud_score: 0,
    });
  }
};

// Function to validate payer-payee relationship
async function validatePayerPayeeRelationship(payerId, payeeId) {
  try {
    // Count previous transactions between this payer and payee
    return await Transaction.countDocuments({
      payer_id: payerId,
      payee_id: payeeId,
      payment: 'completed'
    });
  } catch (error) {
    console.error("Error validating payer-payee relationship:", error);
    return 0;
  }
}

// Function to update transaction with fraud analysis data
async function updateTransactionWithFraudData(transactionId, isFraud, fraudScore) {
  try {
    await Transaction.findOneAndUpdate(
      { transaction_id: transactionId },
      { 
        is_fraud: isFraud,
        fraud_score: fraudScore
      }
    );
  } catch (error) {
    console.error("Error updating transaction with fraud data:", error);
  }
}

// Function to get user's transaction history
async function getUserTransactionHistory(payerId) {
  try {
    // Get last 50 transactions for this payer
    return await Transaction.find({ payer_id: payerId })
      .sort({ date: -1 })
      .limit(50);
  } catch (error) {
    console.error("Error fetching user transaction history:", error);
    return [];
  }
}

// Function to get failed attempts count - modified to use payer_id
async function getFailedAttempts(payerId) {
  try {
    // Count failed attempts in the last 24 hours for this payer
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const failedTransactions = await Transaction.countDocuments({
      payer_id: payerId,
      payment: 'failed',
      date: { $gte: oneDayAgo }
    });
    
    return failedTransactions;
  } catch (error) {
    console.error("Error fetching failed attempts:", error);
    return 0;
  }
}

// Function to get recent transaction count within minutes
async function getRecentTransactionCount(payerId, minutes) {
  try {
    const timeWindow = new Date(Date.now() - minutes * 60 * 1000);
    return await Transaction.countDocuments({
      payer_id: payerId,
      date: { $gte: timeWindow }
    });
  } catch (error) {
    console.error("Error counting recent transactions:", error);
    return 0;
  }
}

// Function to calculate average transaction amount
function calculateAverageTransactionAmount(transactions) {
  if (!transactions || transactions.length === 0) return null;
  
  const sum = transactions.reduce((total, tx) => total + tx.amount, 0);
  return sum / transactions.length;
}

// Function to get common states from transaction history
function getCommonStates(transactions) {
  if (!transactions || transactions.length < 3) return [];
  
  // Count occurrences of each state
  const stateCounts = {};
  transactions.forEach(tx => {
    if (tx.state) {
      const state = tx.state.toLowerCase();
      stateCounts[state] = (stateCounts[state] || 0) + 1;
    }
  });
  
  // Get states that appear in at least 20% of transactions
  const threshold = transactions.length * 0.2;
  return Object.keys(stateCounts).filter(state => stateCounts[state] >= threshold);
}

// Function to get known fraudulent IPs from previous fraudulent transactions
async function getFraudulentIPs() {
  try {
    // Get IPs from transactions marked as fraudulent
    const fraudTxs = await Transaction.find({ is_fraud: true }).limit(1000);
    return [...new Set(fraudTxs.map(tx => tx.ip))]; // Use Set to remove duplicates
  } catch (error) {
    console.error("Error fetching fraudulent IPs:", error);
    return [];
  }
}

// Function to get payee fraud ratio
async function getPayeeFraudRatio(payeeId) {
  try {
    const totalTxCount = await Transaction.countDocuments({ payee_id: payeeId });
    
    if (totalTxCount === 0) return 0;
    
    const fraudTxCount = await Transaction.countDocuments({
      payee_id: payeeId,
      is_fraud: true
    });
    
    return fraudTxCount / totalTxCount;
  } catch (error) {
    console.error("Error calculating payee fraud ratio:", error);
    return 0;
  }
}

// Additional utility for fraud reporting
exports.reportFraud = async (req, res) => {
  try {
    const { transaction_id } = req.body;
    
    // Update transaction as reported for fraud
    await Transaction.findOneAndUpdate(
      { transaction_id },
      { 
        is_fraud: true,
        is_fraud_reported: true
      }
    );
    
    return res.status(200).json({
      success: true,
      message: `Transaction ${transaction_id} marked as fraudulent`
    });
  } catch (error) {
    console.error("Error reporting fraud:", error);
    return res.status(500).json({
      success: false,
      message: "Error reporting fraud"
    });
  }
};

// Function to get fraud statistics
exports.getFraudStats = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // Get total transaction count in last 30 days
    const totalCount = await Transaction.countDocuments({
      date: { $gte: thirtyDaysAgo }
    });
    
    // Get fraudulent transaction count in last 30 days
    const fraudCount = await Transaction.countDocuments({
      date: { $gte: thirtyDaysAgo },
      is_fraud: true
    });
    
    // Get top fraudulent states
    const fraudByState = await Transaction.aggregate([
      { $match: { is_fraud: true, date: { $gte: thirtyDaysAgo } }},
      { $group: { _id: "$state", count: { $sum: 1 } }},
      { $sort: { count: -1 }},
      { $limit: 5 }
    ]);
    
    // Get average fraud score
    const avgScoreResult = await Transaction.aggregate([
      { $match: { date: { $gte: thirtyDaysAgo }, fraud_score: { $exists: true } }},
      { $group: { _id: null, avgScore: { $avg: "$fraud_score" } }}
    ]);
    
    const avgScore = avgScoreResult.length > 0 ? avgScoreResult[0].avgScore : 0;
    
    return res.status(200).json({
      totalTransactions: totalCount,
      fraudulentTransactions: fraudCount,
      fraudRate: totalCount > 0 ? (fraudCount / totalCount * 100).toFixed(2) + '%' : '0%',
      topFraudulentStates: fraudByState,
      averageFraudScore: avgScore.toFixed(2),
      fraudScoreThreshold: FRAUD_SCORE_THRESHOLD
    });
  } catch (error) {
    console.error("Error fetching fraud statistics:", error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving fraud statistics"
    });
  }
};