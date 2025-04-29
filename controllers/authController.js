const express = require('express');
const router = express.Router();
const userModel = require("../models/userModel");
const bcrypt = require('bcrypt');
const { generateToken } = require("../utils/generateToken");

exports.registerUser = async function(req,res){
    try{
        let present = await userModel.findOne({email : req.body.email});
        if(!present){
            let{email , fullname , password} = req.body;
            bcrypt.genSalt(10, function(err, salt) {
        bcrypt.hash(password, salt, async function(err, hash) {
            if(err) return res.send(err.message);
            else{
                let user = await userModel.create({
                email, password : hash, fullname
                });
                return res.status(200).json({
                    success: true,
                    user: user
                })
            }
        });
    }); 
}
else {
    return res.status(401).json({
        success: false,
        message: "Internal server error"
    });
}     
    }
    catch(err){
        res.status(500).json({
            success: false,
            message: "some internal server error"
        });
    }
}

exports.loginUser = async function(req,res){
    let {email , password} = req.body;
    let user = await userModel.findOne({ email : email});
    if(!user){return res.status(404).send("User not found");
    }
    bcrypt.compare(password , user.password , function(err, result){
        if(result){
            let token = generateToken(user);
            res.cookie("token" , token).status(200).json({
                success: true,
                message: "User logged in"
            });
        }
        else{
            return res.status(501).json({
                success: false,
                message: "Incorrect credentials"
            });
        }
    });
}

exports.logout = async function(req,res){
    res.cookie("token" , "");
}

