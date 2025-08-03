// package: inference
// file: inference.proto

/* tslint:disable */
/* eslint-disable */

import * as grpc from "@grpc/grpc-js";
import * as inference_pb from "./inference_pb";

interface IInferenceServiceService extends grpc.ServiceDefinition<grpc.UntypedServiceImplementation> {
    classify: IInferenceServiceService_IClassify;
}

interface IInferenceServiceService_IClassify extends grpc.MethodDefinition<inference_pb.ClassifyRequest, inference_pb.ClassifyResponse> {
    path: "/inference.InferenceService/Classify";
    requestStream: false;
    responseStream: false;
    requestSerialize: grpc.serialize<inference_pb.ClassifyRequest>;
    requestDeserialize: grpc.deserialize<inference_pb.ClassifyRequest>;
    responseSerialize: grpc.serialize<inference_pb.ClassifyResponse>;
    responseDeserialize: grpc.deserialize<inference_pb.ClassifyResponse>;
}

export const InferenceServiceService: IInferenceServiceService;

export interface IInferenceServiceServer extends grpc.UntypedServiceImplementation {
    classify: grpc.handleUnaryCall<inference_pb.ClassifyRequest, inference_pb.ClassifyResponse>;
}

export interface IInferenceServiceClient {
    classify(request: inference_pb.ClassifyRequest, callback: (error: grpc.ServiceError | null, response: inference_pb.ClassifyResponse) => void): grpc.ClientUnaryCall;
    classify(request: inference_pb.ClassifyRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: inference_pb.ClassifyResponse) => void): grpc.ClientUnaryCall;
    classify(request: inference_pb.ClassifyRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: inference_pb.ClassifyResponse) => void): grpc.ClientUnaryCall;
}

export class InferenceServiceClient extends grpc.Client implements IInferenceServiceClient {
    constructor(address: string, credentials: grpc.ChannelCredentials, options?: Partial<grpc.ClientOptions>);
    public classify(request: inference_pb.ClassifyRequest, callback: (error: grpc.ServiceError | null, response: inference_pb.ClassifyResponse) => void): grpc.ClientUnaryCall;
    public classify(request: inference_pb.ClassifyRequest, metadata: grpc.Metadata, callback: (error: grpc.ServiceError | null, response: inference_pb.ClassifyResponse) => void): grpc.ClientUnaryCall;
    public classify(request: inference_pb.ClassifyRequest, metadata: grpc.Metadata, options: Partial<grpc.CallOptions>, callback: (error: grpc.ServiceError | null, response: inference_pb.ClassifyResponse) => void): grpc.ClientUnaryCall;
}
