// package: inference
// file: inference.proto

/* tslint:disable */
/* eslint-disable */

import * as jspb from "google-protobuf";

export class ClassifyRequest extends jspb.Message { 
    getSepalLength(): number;
    setSepalLength(value: number): ClassifyRequest;
    getSepalWidth(): number;
    setSepalWidth(value: number): ClassifyRequest;
    getPetalLength(): number;
    setPetalLength(value: number): ClassifyRequest;
    getPetalWidth(): number;
    setPetalWidth(value: number): ClassifyRequest;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): ClassifyRequest.AsObject;
    static toObject(includeInstance: boolean, msg: ClassifyRequest): ClassifyRequest.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: ClassifyRequest, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): ClassifyRequest;
    static deserializeBinaryFromReader(message: ClassifyRequest, reader: jspb.BinaryReader): ClassifyRequest;
}

export namespace ClassifyRequest {
    export type AsObject = {
        sepalLength: number,
        sepalWidth: number,
        petalLength: number,
        petalWidth: number,
    }
}

export class ClassifyResponse extends jspb.Message { 
    getPredictedClass(): number;
    setPredictedClass(value: number): ClassifyResponse;
    getClassName(): string;
    setClassName(value: string): ClassifyResponse;
    clearProbabilitiesList(): void;
    getProbabilitiesList(): Array<number>;
    setProbabilitiesList(value: Array<number>): ClassifyResponse;
    addProbabilities(value: number, index?: number): number;
    getConfidence(): number;
    setConfidence(value: number): ClassifyResponse;
    getModelInfo(): string;
    setModelInfo(value: string): ClassifyResponse;
    getInferenceTimeMs(): number;
    setInferenceTimeMs(value: number): ClassifyResponse;

    serializeBinary(): Uint8Array;
    toObject(includeInstance?: boolean): ClassifyResponse.AsObject;
    static toObject(includeInstance: boolean, msg: ClassifyResponse): ClassifyResponse.AsObject;
    static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
    static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
    static serializeBinaryToWriter(message: ClassifyResponse, writer: jspb.BinaryWriter): void;
    static deserializeBinary(bytes: Uint8Array): ClassifyResponse;
    static deserializeBinaryFromReader(message: ClassifyResponse, reader: jspb.BinaryReader): ClassifyResponse;
}

export namespace ClassifyResponse {
    export type AsObject = {
        predictedClass: number,
        className: string,
        probabilitiesList: Array<number>,
        confidence: number,
        modelInfo: string,
        inferenceTimeMs: number,
    }
}
