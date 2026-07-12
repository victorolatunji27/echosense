#!/usr/bin/env python3
"""
Convert a Keras-3-flavored tfjs model.json to legacy Keras 2 topology.

tensorflowjs_converter run against a Keras 3 export (keras>=3) writes the
Keras 3 serialization format into model.json: `batch_shape` instead of
`batch_input_shape`, DTypePolicy objects instead of dtype strings, and the
new `{"args": [...]}` inbound_nodes format. tfjs-layers (the browser
runtime) only understands the legacy Keras 2 format and fails with
"An InputLayer should be passed either a `batchInputShape` or an
`inputShape`". This script rewrites the topology in place; the weight
shards are untouched.

Handles both Functional models (the CNN) and Sequential models (the LSTM).

Usage:
    python3 scripts/fix_tfjs_model_json.py public/models/cnn/model.json
    python3 scripts/fix_tfjs_model_json.py public/models/lstm/model.json

Run it after every re-export from train_cnn.py / train_lstm.py
(train_lstm.py runs it automatically on its tfjs export).
"""
import json
import sys


def convert_dtype(dtype):
    """DTypePolicy object -> plain dtype string."""
    if isinstance(dtype, dict):
        return dtype.get('config', {}).get('name', 'float32')
    return dtype


def extract_keras_tensors(obj, out):
    """Collect [layer_name, node_index, tensor_index] triples from Keras 3
    call args, in order."""
    if isinstance(obj, dict):
        if obj.get('class_name') == '__keras_tensor__':
            out.append(obj['config']['keras_history'])
        else:
            for v in obj.values():
                extract_keras_tensors(v, out)
    elif isinstance(obj, list):
        for v in obj:
            extract_keras_tensors(v, out)


def convert_inbound_nodes(nodes):
    """Keras 3 node dicts -> legacy nested-list format."""
    if not nodes or not isinstance(nodes[0], dict):
        return nodes  # already legacy
    legacy = []
    for node in nodes:
        tensors = []
        extract_keras_tensors(node.get('args', []), tensors)
        legacy.append([[name, node_idx, tensor_idx, {}]
                       for name, node_idx, tensor_idx in tensors])
    return legacy


def convert_layer(layer):
    cfg = layer.get('config', {})
    cfg['dtype'] = convert_dtype(cfg.get('dtype'))

    if layer['class_name'] == 'InputLayer' and 'batch_shape' in cfg:
        cfg['batch_input_shape'] = cfg.pop('batch_shape')

    # tfjs expects a numeric axis on BatchNormalization
    axis = cfg.get('axis')
    if isinstance(axis, list) and len(axis) == 1:
        cfg['axis'] = axis[0]

    # Keras-3-only keys tfjs doesn't know
    for key in ('optional', 'synchronized', 'build_config', 'seed'):
        cfg.pop(key, None)
    layer.pop('build_config', None)
    layer.pop('module', None)
    layer.pop('registered_name', None)

    # Legacy layer entries carry the name at the top level too
    if 'name' not in layer and 'name' in cfg:
        layer['name'] = cfg['name']

    if 'inbound_nodes' in layer:
        layer['inbound_nodes'] = convert_inbound_nodes(layer['inbound_nodes'])


def normalize_boundary_layers(value):
    """Keras 3 writes a flat [name, node, tensor] triple for single-input
    models; legacy format is a list of triples."""
    if isinstance(value, list) and value and isinstance(value[0], str):
        return [value]
    return value


def main(path):
    with open(path) as f:
        manifest = json.load(f)

    model_config = manifest['modelTopology']['model_config']
    if model_config['class_name'] == 'Functional':
        model_config['class_name'] = 'Model'

    cfg = model_config['config']
    if isinstance(cfg, dict):
        if 'dtype' in cfg:
            cfg['dtype'] = convert_dtype(cfg['dtype'])
        cfg.pop('build_input_shape', None)

        for key in ('input_layers', 'output_layers'):
            if key in cfg:
                cfg[key] = normalize_boundary_layers(cfg[key])

        layers = cfg['layers']
    else:
        layers = cfg  # legacy Sequential configs can be a bare layer list

    for layer in layers:
        convert_layer(layer)

    # Sequential models: Keras 3 inserts an explicit InputLayer entry; move
    # its shape onto the first real layer, where tfjs Sequential expects it.
    if model_config['class_name'] == 'Sequential' and layers:
        first = layers[0]
        if first['class_name'] == 'InputLayer':
            batch_shape = first['config'].get('batch_input_shape')
            del layers[0]
            if batch_shape and layers:
                layers[0]['config'].setdefault('batch_input_shape', batch_shape)

    # tfjs looks weights up as "<layer_name>/<var_name>". Keras 3 manifests
    # can carry extra scopes (model name, inner cell scope) like
    # "asl_lstm/lstm_1/lstm_cell/kernel" — strip down to the layer segment
    # plus the final variable name.
    layer_names = {
        layer['config'].get('name', layer.get('name')) for layer in layers
    }
    for group in manifest.get('weightsManifest', []):
        for weight in group['weights']:
            segments = weight['name'].split('/')
            if len(segments) > 2:
                for seg in segments[:-1]:
                    if seg in layer_names:
                        weight['name'] = f'{seg}/{segments[-1]}'
                        break

    # Keras 3 names the DepthwiseConv2D weight "kernel"; tfjs builds the
    # variable as "depthwise_kernel". Rename in the weights manifest.
    depthwise_layers = {
        layer['config'].get('name', layer.get('name'))
        for layer in layers
        if layer['class_name'] == 'DepthwiseConv2D'
    }
    for group in manifest.get('weightsManifest', []):
        for weight in group['weights']:
            layer_name, _, var_name = weight['name'].rpartition('/')
            if layer_name in depthwise_layers and var_name == 'kernel':
                weight['name'] = f'{layer_name}/depthwise_kernel'

    with open(path, 'w') as f:
        json.dump(manifest, f)
    print(f"Rewrote {path} in legacy Keras 2 topology "
          f"({len(layers)} layers, {model_config['class_name']}).")


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'public/models/cnn/model.json')
