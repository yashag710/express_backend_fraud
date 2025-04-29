// const express = require('express');
// const router = express.Router();
// const KafkaProducerService = require('../services/kafkaProducer');
// const { v4: uuidv4 } = require('uuid');
// const axios = require('axios');

// router.post('/send', async (req, res) => {
//   try {
//     const transactionId = uuidv4();
//     const transactionData = {
//       ...req.body,
//       transaction_id: transactionId,
//       timestamp: new Date().toISOString()
//     };
//     await KafkaProducerService.sendMessage('transaction-requests', transactionData , req.ip);
//     console.log('Transaction sent to Kafka:', transactionData);

//     res.json({
//       success: true,
//       transactionId,
//       message: 'Transaction sent to processing queue'
//     });
//   } catch (error) {
//     console.error('Error sending transaction to Kafka:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to process transaction'
//     });
//   }
// });

// module.exports = router;