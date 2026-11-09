#!/usr/bin/env python3
"""Export the DeepLabV3 MobileNetV2 ADE20K TFLite model into a small JSON graph
plus a float32 weights file that js/segment.js runs with TensorFlow.js.

Usage: python3 tools/export_segmodel.py <deeplabv3_mnv2_ade20k_float.tflite> <out_dir>

The TFLite preprocessing (pad to 513x513, scale to [-1, 1]) and the final
ARG_MAX are done in JavaScript; only the network ops are exported.
Model: DeepLabV3+ MobileNetV2 trained on ADE20K (TensorFlow models, Apache-2.0).
"""
import json, sys, os
import numpy as np
import tflite

PADDING = {0: 'same', 1: 'valid'}
ACT = {0: None, 1: 'relu', 3: 'relu6'}


def main(path, out_dir):
    buf = open(path, 'rb').read()
    m = tflite.Model.GetRootAsModel(buf, 0)
    g = m.Subgraphs(0)
    names = {v: k for k, v in tflite.BuiltinOperator.__dict__.items() if not k.startswith('_')}

    def tensor_data(i):
        t = g.Tensors(i)
        b = m.Buffers(t.Buffer())
        if b.DataLength() == 0:
            return None
        raw = b.DataAsNumpy().tobytes()
        dt = {tflite.TensorType.FLOAT32: np.float32, tflite.TensorType.INT32: np.int32}[t.Type()]
        return np.frombuffer(raw, dtype=dt).reshape(t.ShapeAsNumpy() if t.ShapeLength() else ())

    ops, blobs, offset = [], [], 0
    first = None
    for i in range(g.OperatorsLength()):
        op = g.Operators(i)
        code = m.OperatorCodes(op.OpcodeIndex())
        name = names[max(code.BuiltinCode(), code.DeprecatedBuiltinCode())]
        if name == 'CONV_2D' and first is None:
            first = i
        if first is None or name == 'ARG_MAX':
            continue
        ins = [int(x) for x in op.InputsAsNumpy()]
        outs = [int(x) for x in op.OutputsAsNumpy()]
        rec = {'op': name, 'in': [], 'out': outs[0]}
        opt = op.BuiltinOptions()
        if name in ('CONV_2D', 'DEPTHWISE_CONV_2D'):
            o = (tflite.Conv2DOptions if name == 'CONV_2D' else tflite.DepthwiseConv2DOptions)()
            o.Init(opt.Bytes, opt.Pos)
            w = tensor_data(ins[1]).astype(np.float32)
            bvals = tensor_data(ins[2]).astype(np.float32)
            if name == 'CONV_2D':        # [out,H,W,in] -> [H,W,in,out]
                w = np.transpose(w, (1, 2, 3, 0))
            else:                        # [1,H,W,in*mult] -> [H,W,in,mult] (mult = 1 here)
                w = np.transpose(w, (1, 2, 3, 0))
            rec.update(stride=[o.StrideH(), o.StrideW()], dilation=[o.DilationHFactor(), o.DilationWFactor()],
                       pad=PADDING[o.Padding()], act=ACT[o.FusedActivationFunction()])
            for arr, key in ((w, 'w'), (bvals, 'b')):
                arr = np.ascontiguousarray(arr)
                rec[key] = {'offset': offset, 'shape': list(arr.shape)}
                blobs.append(arr.tobytes()); offset += arr.size
            rec['in'] = [ins[0]]
        elif name == 'ADD':
            o = tflite.AddOptions(); o.Init(opt.Bytes, opt.Pos)
            rec['act'] = ACT[o.FusedActivationFunction()]
            rec['in'] = ins
        elif name == 'AVERAGE_POOL_2D':
            o = tflite.Pool2DOptions(); o.Init(opt.Bytes, opt.Pos)
            rec.update(filter=[o.FilterHeight(), o.FilterWidth()], stride=[o.StrideH(), o.StrideW()], pad=PADDING[o.Padding()])
            rec['in'] = ins
        elif name == 'RESIZE_BILINEAR':
            o = tflite.ResizeBilinearOptions(); o.Init(opt.Bytes, opt.Pos)
            rec.update(size=[int(x) for x in tensor_data(ins[1])], alignCorners=bool(o.AlignCorners()),
                       halfPixel=bool(o.HalfPixelCenters()))
            rec['in'] = [ins[0]]
        elif name == 'CONCATENATION':
            o = tflite.ConcatenationOptions(); o.Init(opt.Bytes, opt.Pos)
            rec['axis'] = o.Axis()
            rec['in'] = ins
        else:
            raise SystemExit('unsupported op ' + name)
        ops.append(rec)

    first_in = [int(x) for x in g.Operators(first).InputsAsNumpy()][0]
    graph = {'input': first_in, 'output': ops[-1]['out'], 'size': 513, 'classes': 151, 'ops': ops,
             'labels': {'wall': 1, 'building': 2, 'floor': 4, 'ceiling': 6, 'windowpane': 9, 'cabinet': 11, 'door': 15,
                        'house': 26, 'column': 43, 'stairs': 54, 'screen_door': 59, 'stairway': 60, 'railing': 96}}
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, 'seg-graph.json'), 'w') as f:
        json.dump(graph, f, separators=(',', ':'))
    with open(os.path.join(out_dir, 'seg-weights.bin'), 'wb') as f:
        for b in blobs:
            f.write(b)
    print(len(ops), 'ops,', offset * 4 // 1024, 'KB weights')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
