// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('@grpc/grpc-js');
var inference_pb = require('./inference_pb.js');

function serialize_inference_ClassifyRequest(arg) {
  if (!(arg instanceof inference_pb.ClassifyRequest)) {
    throw new Error('Expected argument of type inference.ClassifyRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_inference_ClassifyRequest(buffer_arg) {
  return inference_pb.ClassifyRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_inference_ClassifyResponse(arg) {
  if (!(arg instanceof inference_pb.ClassifyResponse)) {
    throw new Error('Expected argument of type inference.ClassifyResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_inference_ClassifyResponse(buffer_arg) {
  return inference_pb.ClassifyResponse.deserializeBinary(new Uint8Array(buffer_arg));
}


var InferenceServiceService = exports.InferenceServiceService = {
  classify: {
    path: '/inference.InferenceService/Classify',
    requestStream: false,
    responseStream: false,
    requestType: inference_pb.ClassifyRequest,
    responseType: inference_pb.ClassifyResponse,
    requestSerialize: serialize_inference_ClassifyRequest,
    requestDeserialize: deserialize_inference_ClassifyRequest,
    responseSerialize: serialize_inference_ClassifyResponse,
    responseDeserialize: deserialize_inference_ClassifyResponse,
  },
};

exports.InferenceServiceClient = grpc.makeGenericClientConstructor(InferenceServiceService, 'InferenceService');
